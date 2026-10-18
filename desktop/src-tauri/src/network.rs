//! Автозагрузки разрешаются только при подтверждённом системой неограниченном соединении.
#[cfg(target_os = "macos")]
mod macos {
    use std::ffi::c_void;
    use std::sync::{Once, atomic::{AtomicBool, Ordering}};
    use block2::{Block, RcBlock};
    static START: Once = Once::new();
    static UNMETERED: AtomicBool = AtomicBool::new(false);
    #[link(name = "Network", kind = "framework")]
    extern "C" {
        fn nw_path_monitor_create() -> *mut c_void;
        fn nw_path_monitor_set_queue(monitor: *mut c_void, queue: *mut c_void);
        fn nw_path_monitor_set_update_handler(monitor: *mut c_void, handler: *mut Block<dyn Fn(*mut c_void)>);
        fn nw_path_monitor_start(monitor: *mut c_void);
        fn nw_path_get_status(path: *mut c_void) -> i32;
        fn nw_path_is_expensive(path: *mut c_void) -> bool;
        fn nw_path_is_constrained(path: *mut c_void) -> bool;
    }
    extern "C" { fn dispatch_get_global_queue(identifier: isize, flags: usize) -> *mut c_void; }
    pub fn unmetered() -> bool {
        START.call_once(|| unsafe {
            let monitor = nw_path_monitor_create();
            if monitor.is_null() { return; }
            let handler = RcBlock::new(|path: *mut c_void| {
                UNMETERED.store(nw_path_get_status(path) == 1 && !nw_path_is_expensive(path) && !nw_path_is_constrained(path), Ordering::Relaxed);
            });
            nw_path_monitor_set_queue(monitor, dispatch_get_global_queue(0, 0));
            nw_path_monitor_set_update_handler(monitor, RcBlock::as_ptr(&handler));
            // Монитор живёт столько же, сколько процесс: Network удерживает копию блока.
            nw_path_monitor_start(monitor);
        });
        UNMETERED.load(Ordering::Relaxed)
    }
}

pub fn unmetered() -> bool {
    #[cfg(target_os = "macos")]
    { macos::unmetered() }
    #[cfg(windows)]
    {
        use windows::Networking::Connectivity::{NetworkInformation, NetworkCostType, NetworkConnectivityLevel};
        (|| -> windows::core::Result<bool> {
            let profile = NetworkInformation::GetInternetConnectionProfile()?;
            Ok(profile.GetNetworkConnectivityLevel()? == NetworkConnectivityLevel::InternetAccess &&
                profile.GetConnectionCost()?.NetworkCostType()? == NetworkCostType::Unrestricted)
        })().unwrap_or(false)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        std::process::Command::new("nmcli")
            .env("LC_ALL", "C")
            .args(["-t", "-f", "GENERAL.DEVICE,GENERAL.STATE,GENERAL.METERED,IP4.GATEWAY,IP6.GATEWAY", "device", "show"])
            .output().ok().filter(|output| output.status.success())
            .map(|output| nmcli_unmetered(&String::from_utf8_lossy(&output.stdout))).unwrap_or(false)
    }
}

#[tauri::command]
pub async fn network_unmetered() -> bool { unmetered() }

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn nmcli_unmetered(text: &str) -> bool {
    let mut candidates = Vec::new();
    let mut connected = false;
    let mut gateway = false;
    let mut unmetered = false;
    for line in text.lines().chain(std::iter::once("GENERAL.DEVICE:")) {
        let Some((key, value)) = line.split_once(':') else { continue };
        match key {
            "GENERAL.DEVICE" => {
                if connected && gateway { candidates.push(unmetered); }
                connected = false; gateway = false; unmetered = false;
            }
            "GENERAL.STATE" => connected = value.starts_with("100"),
            "GENERAL.METERED" => unmetered = value == "no" || value.starts_with("no "),
            "IP4.GATEWAY" | "IP6.GATEWAY" => gateway |= !value.is_empty() && value != "--",
            _ => {}
        }
    }
    !candidates.is_empty() && candidates.into_iter().all(|value| value)
}

#[cfg(test)]
mod tests {
    use super::nmcli_unmetered;
    #[test]
    fn loopback_does_not_authorize_an_unknown_or_metered_connection() {
        let loopback = "GENERAL.DEVICE:lo\nGENERAL.STATE:100 (connected)\nGENERAL.METERED:no\nIP4.GATEWAY:\n";
        assert!(!nmcli_unmetered(loopback));
        for cost in ["unknown", "yes", "yes (guessed)"] {
            assert!(!nmcli_unmetered(&format!("{loopback}GENERAL.DEVICE:wlan0\nGENERAL.STATE:100 (connected)\nGENERAL.METERED:{cost}\nIP4.GATEWAY:192.168.1.1\n")));
        }
        assert!(nmcli_unmetered(&format!("{loopback}GENERAL.DEVICE:eth0\nGENERAL.STATE:100 (connected)\nGENERAL.METERED:no (guessed)\nIP4.GATEWAY:192.168.1.1\n")));
    }
}

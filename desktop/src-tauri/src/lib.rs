// Значки рисуются только для панели задач Windows; на других системах модуль живёт ради тестов.
#[cfg_attr(not(windows), allow(dead_code))]
mod glyphs;
mod library;
mod network;
mod palette;
mod nd_api;
#[cfg(desktop)]
mod tray;
#[cfg(desktop)]
mod discord;

#[cfg(target_os = "macos")]
mod sf_symbols;

/// Значки SF Symbols есть только на Mac; в остальных системах значки берутся из своих шрифтов.
#[cfg(not(target_os = "macos"))]
mod sf_symbols {
    #[tauri::command]
    pub fn system_symbols(_names: Vec<String>) -> std::collections::HashMap<String, String> {
        Default::default()
    }
}

#[cfg(windows)]
mod windows_shell;

/// На Mac и Linux системный плеер приходит из WebView (Media Session), а кнопок в превью
/// и акцента Windows нет: команды есть, но ничего не делают — окну не нужно знать, где оно.
#[cfg(not(windows))]
mod windows_shell {
    use serde::{Deserialize, Serialize};
    use tauri::{AppHandle, WebviewWindow};

    pub fn setup(_app: &AppHandle, _window: &WebviewWindow) {}

    #[derive(Deserialize)]
    pub struct NowPlaying {}

    #[derive(Serialize)]
    pub struct NativeStyle {
        platform: &'static str,
        mica: bool,
    }

    #[tauri::command]
    pub async fn media_metadata(_song: NowPlaying) -> Result<(), String> {
        Ok(())
    }

    #[tauri::command]
    pub fn media_state(_playing: bool, _active: bool, _position: f64, _duration: f64) {}

    #[tauri::command]
    pub fn taskbar_labels(_previous: String, _play: String, _pause: String, _next: String) {}

    #[tauri::command]
    pub fn native_style() -> NativeStyle {
        NativeStyle { platform: if cfg!(target_os = "macos") { "macos" } else { "linux" }, mica: false }
    }
}

use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Учётные данные сервера. Пароль живёт в системном хранилище (Keychain, Credential Manager,
/// Secret Service), а не в файле настроек и не в localStorage окна.
#[derive(Serialize, Deserialize)]
pub struct Credentials {
    pub server: String,
    pub username: String,
    pub password: String,
}

const SERVICE: &str = "app.nocturne.music";

fn entry(account: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, account).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_credentials(account: String, credentials: Credentials) -> Result<(), String> {
    let payload = serde_json::to_string(&credentials).map_err(|error| error.to_string())?;
    entry(&account)?
        .set_password(&payload)
        .map_err(|error| error.to_string())
}

/// Только для отладочной сборки: подставляет учётные данные тестового сервера из
/// NOCTURNE_DEV_CREDENTIALS, чтобы проверять приложение, не вводя ничего руками.
/// В релизной сборке этого кода нет.
#[cfg(debug_assertions)]
fn dev_credentials() -> Option<Credentials> {
    let raw = std::env::var("NOCTURNE_DEV_CREDENTIALS").ok()?;
    serde_json::from_str(&raw).ok()
}

#[cfg(not(debug_assertions))]
fn dev_credentials() -> Option<Credentials> {
    None
}

#[tauri::command]
fn load_credentials(account: String) -> Result<Option<Credentials>, String> {
    if let Some(credentials) = dev_credentials() {
        return Ok(Some(credentials));
    }
    match entry(&account)?.get_password() {
        Ok(payload) => serde_json::from_str(&payload)
            .map(Some)
            .map_err(|error| error.to_string()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn delete_credentials(account: String) -> Result<(), String> {
    match entry(&account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

/// Цвета обложки — с сервера по адресу или с диска по пути. Обложка не открылась — цвета нет,
/// окно останется со своим акцентом.
#[tauri::command]
async fn cover_palette(url: Option<String>, path: Option<String>) -> Option<palette::Palette> {
    let bytes = match (path, url) {
        (Some(path), _) => tokio::fs::read(path).await.ok()?,
        (None, Some(url)) => {
            let response = reqwest::get(url).await.ok()?;
            if !response.status().is_success() {
                return None;
            }
            response.bytes().await.ok()?.to_vec()
        }
        (None, None) => return None,
    };
    tauri::async_runtime::spawn_blocking(move || palette::from_image(&bytes)).await.ok()?
}

/// Журнал событий звука в терминал — только в отладочной сборке, в релизе команда молчит.
#[tauri::command]
fn debug_log(line: String) {
    if cfg!(debug_assertions) {
        eprintln!("[web] {line}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Второй запуск (ярлык в «Пуске», файл «Открыть с помощью») не открывает второе окно с
    // ещё одним плеером, а разворачивает уже открытое. Плагин должен стоять первым.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
    // Окно открывается там же и того же размера, где его закрыли — как любое приложение системы.
    #[cfg(desktop)]
    // Полноэкранный режим не запоминается: его включает полноэкранный плеер, и после перезапуска
    // окно на весь экран без плеера выглядело бы поломкой.
    let builder = builder.plugin(
        tauri_plugin_window_state::Builder::new()
            .with_state_flags(tauri_plugin_window_state::StateFlags::all() & !tauri_plugin_window_state::StateFlags::FULLSCREEN)
            .build(),
    );
    // Глобальные сочетания: регистрирует их окно (set_global_shortcuts) по настройке.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(tray::on_shortcut).build());
    let builder = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init());
    // Обновлялка живёт только на настольных системах, где приложение ставят файлом.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    builder
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                windows_shell::setup(app.handle(), &window);
            }
            #[cfg(desktop)]
            tray::setup(app.handle());
            Ok(())
        })
        // Закрыть окно плеера — не значит остановить музыку: на Mac окно прячется всегда (как у
        // «Музыки»), на Windows и Linux — если включено «Сворачивать в трей».
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let keep = cfg!(target_os = "macos") || tray::CLOSE_TO_TRAY.load(std::sync::atomic::Ordering::Relaxed);
                if window.label() == "main" && keep {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            network::network_unmetered,
            save_credentials,
            load_credentials,
            delete_credentials,
            debug_log,
            cover_palette,
            nd_api::navidrome_api,
            sf_symbols::system_symbols,
            library::local_library,
            library::import_items,
            library::remove_local,
            library::download_track,
            library::downloads,
            library::remove_download,
            windows_shell::media_metadata,
            windows_shell::media_state,
            windows_shell::taskbar_labels,
            windows_shell::native_style,
            #[cfg(desktop)]
            tray::set_global_shortcuts,
            #[cfg(desktop)]
            tray::set_close_to_tray,
            #[cfg(desktop)]
            tray::tray_update,
            #[cfg(desktop)]
            discord::discord_presence,
            #[cfg(desktop)]
            discord::discord_disconnect
        ])
        .build(tauri::generate_context!())
        .expect("не удалось запустить приложение")
        .run(|_app, _event| {
            // Клик по значку в Dock, когда окно спрятано, возвращает его.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { has_visible_windows: false, .. } = _event {
                tray::show_main(_app);
            }
        });
}

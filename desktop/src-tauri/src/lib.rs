use keyring::Entry;
use serde::{Deserialize, Serialize};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            save_credentials,
            load_credentials,
            delete_credentials
        ])
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение");
}

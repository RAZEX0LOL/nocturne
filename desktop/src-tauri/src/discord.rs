//! Статус в Discord: «Слушает Nocturne — Песня, Исполнитель» с полосой времени, как у Spotify.
//!
//! Связь с запущенным клиентом Discord — локальная (IPC), без интернета и без токенов. Нужен ID
//! приложения из Discord Developer Portal: его вводят в настройках. Обложку не отправляем: адрес
//! обложки Navidrome содержит токен доступа, а статус в Discord видят все. Вместо неё — картинка
//! «nocturne», если её загрузили в своё приложение Discord (Rich Presence → Art Assets).

use std::sync::Mutex;

use discord_rich_presence::activity::{Activity, ActivityType, Assets, StatusDisplayType, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use serde::Deserialize;

struct Connection {
    client_id: String,
    ipc: DiscordIpcClient,
}

static CONNECTION: Mutex<Option<Connection>> = Mutex::new(None);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Presence {
    title: String,
    artist: Option<String>,
    album: Option<String>,
    /// Когда трек начался и когда закончится, мс с 1970 года — Discord сам ведёт полосу времени.
    started_at: i64,
    ends_at: Option<i64>,
}

/// Discord ограничивает строки статуса 2–128 символами.
fn fit(text: &str) -> String {
    let trimmed: String = text.chars().take(128).collect();
    if trimmed.chars().count() < 2 { format!("{trimmed} ") } else { trimmed }
}

fn connection(client_id: &str) -> Result<std::sync::MutexGuard<'static, Option<Connection>>, String> {
    let mut guard = CONNECTION.lock().map_err(|e| e.to_string())?;
    if guard.as_ref().is_some_and(|connection| connection.client_id != client_id) {
        if let Some(mut old) = guard.take() {
            let _ = old.ipc.close();
        }
    }
    if guard.is_none() {
        let mut ipc = DiscordIpcClient::new(client_id);
        // Discord не запущен — не ошибка для человека: статус просто не показывается.
        ipc.connect().map_err(|e| format!("Discord не отвечает: {e}"))?;
        *guard = Some(Connection { client_id: client_id.to_string(), ipc });
    }
    Ok(guard)
}

fn apply(client_id: &str, presence: Option<&Presence>) -> Result<(), String> {
    let mut guard = connection(client_id)?;
    let ipc = &mut guard.as_mut().expect("соединение только что создано").ipc;
    let result = match presence {
        None => ipc.clear_activity(),
        Some(presence) => {
            let details = fit(&presence.title);
            let state = fit(presence.artist.as_deref().unwrap_or("Nocturne"));
            let album = presence.album.as_deref().map(fit);
            let mut timestamps = Timestamps::new().start(presence.started_at);
            if let Some(end) = presence.ends_at {
                timestamps = timestamps.end(end);
            }
            let mut assets = Assets::new().large_image("nocturne");
            if let Some(album) = album.as_deref() {
                assets = assets.large_text(album);
            }
            let activity = Activity::new()
                .activity_type(ActivityType::Listening)
                .status_display_type(StatusDisplayType::Details)
                .details(details.as_str())
                .state(state.as_str())
                .timestamps(timestamps)
                .assets(assets);
            ipc.set_activity(activity)
        }
    };
    if let Err(error) = result {
        // Discord перезапускали — соединение умерло; в следующий раз подключимся заново.
        if let Some(mut dead) = guard.take() {
            let _ = dead.ipc.close();
        }
        return Err(format!("Discord: {error}"));
    }
    Ok(())
}

/// Что играет — или ничего (пауза, статус выключен): тогда статус убирается.
#[tauri::command]
pub async fn discord_presence(client_id: String, presence: Option<Presence>) -> Result<(), String> {
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() || !client_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("ID приложения Discord — это число из Developer Portal".into());
    }
    tauri::async_runtime::spawn_blocking(move || apply(&client_id, presence.as_ref())).await.map_err(|e| e.to_string())?
}

/// Статус выключили в настройках — отключаемся от Discord совсем.
#[tauri::command]
pub fn discord_disconnect() {
    if let Ok(mut guard) = CONNECTION.lock() {
        if let Some(mut connection) = guard.take() {
            let _ = connection.ipc.clear_activity();
            let _ = connection.ipc.close();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_lines_fit_discord_limits() {
        assert_eq!(fit("A"), "A ");
        assert_eq!(fit(&"я".repeat(200)).chars().count(), 128);
        assert_eq!(fit("Кукушка"), "Кукушка");
    }

    #[test]
    fn a_wrong_client_id_is_refused_before_touching_discord() {
        let result = tauri::async_runtime::block_on(discord_presence("not-a-number".into(), None));
        assert!(result.is_err());
        let empty = tauri::async_runtime::block_on(discord_presence("  ".into(), None));
        assert!(empty.is_err());
    }
}

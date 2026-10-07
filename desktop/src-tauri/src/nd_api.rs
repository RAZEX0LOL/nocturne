//! Собственный API Navidrome (не Subsonic): нужен для правил умных плейлистов.
//!
//! Вход — `POST /auth/login` с логином и паролем, дальше запросы с заголовком
//! `X-ND-Authorization: Bearer <токен>`. Запросы идут отсюда, а не из окна: Navidrome не обязан
//! разрешать странице приложения ходить в свой API (CORS), а из Rust ограничений нет.
//! Ради безопасности окно может спросить только раздел плейлистов.

use std::collections::HashMap;
use std::sync::Mutex;

use reqwest::{Method, StatusCode};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
pub struct Login {
    server: String,
    username: String,
    password: String,
}

/// Токены по серверу и пользователю: вход — раз, а не на каждый запрос.
static TOKENS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

fn base(server: &str) -> String {
    server.trim_end_matches('/').to_string()
}

/// Только плейлисты: `/api/playlist` и `/api/playlist/<id>`, без выхода за пределы пути.
pub fn allowed(path: &str) -> bool {
    let Some(rest) = path.strip_prefix("/api/playlist") else { return false };
    let rest = rest.split('?').next().unwrap_or_default();
    rest.is_empty() || (rest.starts_with('/') && rest[1..].chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'))
}

async fn login(http: &reqwest::Client, login: &Login) -> Result<String, String> {
    let response = http
        .post(format!("{}/auth/login", base(&login.server)))
        .json(&json!({ "username": login.username, "password": login.password }))
        .send()
        .await
        .map_err(|e| format!("вход в Navidrome: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("вход в Navidrome: {}", response.status()));
    }
    let body: Value = response.json().await.map_err(|e| format!("вход в Navidrome: {e}"))?;
    body.get("token").and_then(Value::as_str).map(str::to_string).ok_or_else(|| "вход в Navidrome: нет токена".into())
}

#[tauri::command]
pub async fn navidrome_api(login: Login, method: String, path: String, body: Option<Value>) -> Result<Value, String> {
    if !allowed(&path) {
        return Err(format!("путь не разрешён: {path}"));
    }
    let method = Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    let http = reqwest::Client::new();
    let key = format!("{}|{}", base(&login.server), login.username);
    for attempt in 0..2 {
        let cached = TOKENS.lock().ok().and_then(|tokens| tokens.as_ref().and_then(|t| t.get(&key).cloned()));
        let token = match cached {
            Some(token) if attempt == 0 => token,
            _ => {
                let fresh = self::login(&http, &login).await?;
                if let Ok(mut tokens) = TOKENS.lock() {
                    tokens.get_or_insert_with(HashMap::new).insert(key.clone(), fresh.clone());
                }
                fresh
            }
        };
        let mut request = http
            .request(method.clone(), format!("{}{}", base(&login.server), path))
            .header("X-ND-Authorization", format!("Bearer {token}"));
        if let Some(body) = &body {
            request = request.json(body);
        }
        let response = request.send().await.map_err(|e| format!("Navidrome: {e}"))?;
        // Токен истёк — входим заново и повторяем запрос один раз.
        if response.status() == StatusCode::UNAUTHORIZED && attempt == 0 {
            continue;
        }
        if !response.status().is_success() {
            return Err(format!("Navidrome ответил {}", response.status()));
        }
        let text = response.text().await.map_err(|e| e.to_string())?;
        return Ok(if text.trim().is_empty() { Value::Null } else { serde_json::from_str(&text).map_err(|e| e.to_string())? });
    }
    Err("Navidrome не принял вход".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_playlists_are_reachable() {
        assert!(allowed("/api/playlist"));
        assert!(allowed("/api/playlist/abc-123"));
        assert!(allowed("/api/playlist?_start=0&_end=50"));
        assert!(!allowed("/api/user"));
        assert!(!allowed("/api/playlist/../user"));
        assert!(!allowed("/api/playlistX"));
        assert!(!allowed("/auth/login"));
    }

    /// Живая проверка против mock-сервера (`shared/mock-server`): вход, создание с правилами, чтение.
    /// Нужен запущенный сервер, поэтому в обычный прогон не входит: `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn talks_to_the_mock_server() {
        let login = || Login { server: "http://127.0.0.1:4533/".into(), username: "test".into(), password: "demo".into() };
        tauri::async_runtime::block_on(async {
            let rules = json!({ "all": [{ "is": { "loved": true } }], "sort": "random", "limit": 10 });
            let created = navidrome_api(login(), "POST".into(), "/api/playlist".into(), Some(json!({ "name": "Из Rust", "rules": rules }))).await.unwrap();
            let id = created["id"].as_str().unwrap().to_string();
            let read = navidrome_api(login(), "GET".into(), format!("/api/playlist/{id}"), None).await.unwrap();
            assert_eq!(read["name"], "Из Rust");
            assert_eq!(read["rules"]["limit"], 10);
            let bad = navidrome_api(login(), "GET".into(), "/api/user".into(), None).await;
            assert!(bad.is_err(), "чужие разделы API закрыты");
            let wrong = Login { password: "nope".into(), ..login() };
            TOKENS.lock().unwrap().take();
            assert!(navidrome_api(wrong, "GET".into(), "/api/playlist".into(), None).await.is_err(), "неверный пароль не входит");
        });
    }
}

//! Своя музыка и загрузки — то, что играет без сервера (shared/spec/offline.md).
//!
//! Своя музыка лежит в открытой папке ~/Music/Nocturne, чтобы её можно было пополнять и из
//! проводника. Загрузки с сервера — в данных приложения, каждая рядом со своими метаданными,
//! чтобы библиотека собиралась после перезапуска без обращения к серверу.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use lofty::prelude::*;
use lofty::probe::Probe;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tokio::io::AsyncWriteExt;

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "m4a", "m4b", "aac", "alac", "flac", "wav", "aif", "aiff", "ogg", "opus"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTrack {
    /// «local:» и хеш пути внутри папки — как на телефоне.
    id: String,
    path: String,
    title: String,
    artist: Option<String>,
    album: Option<String>,
    track: Option<u32>,
    duration: Option<f64>,
    cover: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLibrary {
    folder: String,
    tracks: Vec<LocalTrack>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Download {
    id: String,
    path: String,
    song: Value,
}

fn error(context: &str, error: impl std::fmt::Display) -> String {
    format!("{context}: {error}")
}

pub fn music_folder(app: &AppHandle) -> Result<PathBuf, String> {
    let folder = app.path().audio_dir().map_err(|e| error("папка музыки", e))?.join("Nocturne");
    fs::create_dir_all(&folder).map_err(|e| error("папка музыки", e))?;
    Ok(folder)
}

fn downloads_folder(app: &AppHandle) -> Result<PathBuf, String> {
    let folder = app.path().app_local_data_dir().map_err(|e| error("загрузки", e))?.join("downloads");
    fs::create_dir_all(&folder).map_err(|e| error("загрузки", e))?;
    Ok(folder)
}

fn covers_folder(app: &AppHandle) -> Result<PathBuf, String> {
    let folder = app.path().app_cache_dir().map_err(|e| error("обложки", e))?.join("covers");
    fs::create_dir_all(&folder).map_err(|e| error("обложки", e))?;
    Ok(folder)
}

/// FNV-1a: стабилен между запусками и версиями компилятора, в отличие от стандартного хешера.
fn stable_hash(text: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| AUDIO_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

fn audio_files(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if is_audio(&path) {
                found.push(path);
            }
        }
    }
    found.sort();
    found
}

/// «03 - Название» → (3, «Название»): ведущее число в имени файла — номер трека.
fn split_track_number(name: &str) -> (Option<u32>, String) {
    let digits: String = name.chars().take_while(|c| c.is_ascii_digit()).collect();
    if (1..=3).contains(&digits.len()) {
        let rest = name[digits.len()..].trim_start_matches(|c: char| c.is_whitespace() || c == '.' || c == '-' || c == '_');
        if !rest.is_empty() {
            return (digits.parse().ok(), rest.to_string());
        }
    }
    (None, name.to_string())
}

fn read_track(root: &Path, path: &Path, covers: &Path) -> LocalTrack {
    let relative = path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/");
    let hash = stable_hash(&relative);
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let (number_from_name, title_from_name) = split_track_number(&stem);
    let parent = path.parent().filter(|parent| *parent != root);
    let folder_name = parent.and_then(|p| p.file_name()).map(|s| s.to_string_lossy().to_string());

    let mut track = LocalTrack {
        id: format!("local:{hash}"),
        path: path.to_string_lossy().to_string(),
        title: title_from_name,
        artist: None,
        album: folder_name,
        track: number_from_name,
        duration: None,
        cover: None,
    };

    let Ok(tagged) = Probe::open(path).and_then(|probe| probe.read()) else { return track };
    let seconds = tagged.properties().duration().as_secs_f64();
    if seconds > 0.0 {
        track.duration = Some(seconds);
    }
    let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) else { return track };
    let clean = |value: Option<std::borrow::Cow<'_, str>>| value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
    if let Some(title) = clean(tag.title()) {
        track.title = title;
    }
    track.artist = clean(tag.artist()).or(track.artist);
    track.album = clean(tag.album()).or(track.album);
    track.track = tag.track().or(track.track);

    // Обложку достаём один раз и держим в кеше: читать её из файла на каждый показ дорого.
    if let Some(picture) = tag.pictures().first() {
        let cover = covers.join(format!("{hash}.img"));
        if cover.exists() || fs::write(&cover, picture.data()).is_ok() {
            track.cover = Some(cover.to_string_lossy().to_string());
        }
    }
    track
}

#[tauri::command]
pub async fn local_library(app: AppHandle) -> Result<LocalLibrary, String> {
    let root = music_folder(&app)?;
    let covers = covers_folder(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let tracks = audio_files(&root).iter().map(|path| read_track(&root, path, &covers)).collect();
        LocalLibrary { folder: root.to_string_lossy().to_string(), tracks }
    })
    .await
    .map_err(|e| error("сканирование", e))
}

fn unique_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let extension = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();
    (2..)
        .map(|index| parent.join(format!("{stem} {index}{extension}")))
        .find(|candidate| !candidate.exists())
        .expect("бесконечный ряд имён всегда найдёт свободное")
}

/// Копирует выбранные файлы и папки целиком в папку музыки; возвращает, сколько треков добавлено.
#[tauri::command]
pub async fn import_items(app: AppHandle, paths: Vec<String>) -> Result<usize, String> {
    let root = music_folder(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut added = 0;
        for raw in paths {
            let source = PathBuf::from(raw);
            // Уже лежит в папке — копировать нечего.
            if source.starts_with(&root) {
                continue;
            }
            if source.is_dir() {
                let name = source.file_name().map(|n| n.to_os_string()).unwrap_or_default();
                let target = unique_path(root.join(name));
                for file in audio_files(&source) {
                    let relative = file.strip_prefix(&source).unwrap_or(&file);
                    let destination = target.join(relative);
                    if let Some(parent) = destination.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    if fs::copy(&file, &destination).is_ok() {
                        added += 1;
                    }
                }
            } else if is_audio(&source) {
                let name = source.file_name().map(|n| n.to_os_string()).unwrap_or_default();
                if fs::copy(&source, unique_path(root.join(name))).is_ok() {
                    added += 1;
                }
            }
        }
        added
    })
    .await
    .map_err(|e| error("импорт", e))
}

/// Удаляет файл, только если он действительно внутри папки музыки: путь приходит из окна.
#[tauri::command]
pub fn remove_local(app: AppHandle, path: String) -> Result<(), String> {
    let root = music_folder(&app)?.canonicalize().map_err(|e| error("папка музыки", e))?;
    let target = PathBuf::from(path).canonicalize().map_err(|e| error("файл", e))?;
    if !target.starts_with(&root) {
        return Err("файл вне папки музыки".into());
    }
    fs::remove_file(target).map_err(|e| error("удаление", e))
}

/// Идентификатор сервера превращаем в безопасное имя файла.
fn file_stem_for(id: &str) -> String {
    id.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect()
}

fn extension_for(content_type: &str) -> &'static str {
    match content_type.split(';').next().unwrap_or("").trim() {
        "audio/mpeg" | "audio/mp3" => "mp3",
        "audio/flac" | "audio/x-flac" => "flac",
        "audio/mp4" | "audio/m4a" | "audio/x-m4a" | "audio/aac" => "m4a",
        "audio/wav" | "audio/x-wav" | "audio/wave" | "audio/vnd.wave" => "wav",
        "audio/ogg" | "application/ogg" => "ogg",
        "audio/opus" => "opus",
        _ => "audio",
    }
}

/// Скачивает трек с сервера во временный файл и переносит на место, только когда он дошёл целиком:
/// оборванная загрузка не должна выглядеть как готовая.
#[tauri::command]
pub async fn download_track(app: AppHandle, url: String, id: String, song: Value) -> Result<Download, String> {
    let folder = downloads_folder(&app)?;
    let stem = file_stem_for(&id);
    let response = reqwest::get(&url).await.map_err(|e| error("загрузка", e))?;
    if !response.status().is_success() {
        return Err(format!("сервер ответил {}", response.status()));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let partial = folder.join(format!("{stem}.part"));
    let mut file = tokio::fs::File::create(&partial).await.map_err(|e| error("файл", e))?;
    let mut body = response.bytes_stream();
    while let Some(chunk) = body.next().await {
        let chunk = chunk.map_err(|e| error("загрузка", e))?;
        file.write_all(&chunk).await.map_err(|e| error("запись", e))?;
    }
    file.flush().await.map_err(|e| error("запись", e))?;
    drop(file);

    let target = folder.join(format!("{stem}.{}", extension_for(&content_type)));
    tokio::fs::rename(&partial, &target).await.map_err(|e| error("файл", e))?;
    let meta = serde_json::to_vec(&song).map_err(|e| error("метаданные", e))?;
    tokio::fs::write(folder.join(format!("{stem}.json")), meta).await.map_err(|e| error("метаданные", e))?;
    Ok(Download { id, path: target.to_string_lossy().to_string(), song })
}

#[tauri::command]
pub fn downloads(app: AppHandle) -> Result<Vec<Download>, String> {
    let folder = downloads_folder(&app)?;
    // Приложение могли закрыть посреди загрузки: такой огрызок никому не нужен и место занимает.
    for leftover in fs::read_dir(&folder).into_iter().flatten().flatten() {
        let path = leftover.path();
        if path.extension().is_some_and(|extension| extension == "part") {
            let _ = fs::remove_file(path);
        }
    }
    let mut result = Vec::new();
    let entries = fs::read_dir(&folder).map_err(|e| error("загрузки", e))?;
    let files: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
    let audio: HashSet<&PathBuf> = files.iter().filter(|p| p.extension().is_some_and(|e| e != "json" && e != "part")).collect();
    for meta in files.iter().filter(|p| p.extension().is_some_and(|e| e == "json")) {
        let Ok(text) = fs::read_to_string(meta) else { continue };
        let Ok(song) = serde_json::from_str::<Value>(&text) else { continue };
        let Some(id) = song.get("id").and_then(Value::as_str).map(str::to_string) else { continue };
        let stem = meta.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        // Без аудиофайла метаданные бесполезны — такую загрузку считаем несостоявшейся.
        let Some(path) = audio.iter().find(|p| p.file_stem().is_some_and(|s| s.to_string_lossy() == stem)) else { continue };
        result.push(Download { id, path: path.to_string_lossy().to_string(), song });
    }
    Ok(result)
}

#[tauri::command]
pub fn remove_download(app: AppHandle, id: String) -> Result<(), String> {
    let folder = downloads_folder(&app)?;
    let stem = file_stem_for(&id);
    for entry in fs::read_dir(&folder).map_err(|e| error("загрузки", e))?.flatten() {
        let path = entry.path();
        if path.file_stem().is_some_and(|s| s.to_string_lossy() == stem) {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn track_number_comes_from_the_file_name() {
        assert_eq!(split_track_number("03 - Title"), (Some(3), "Title".into()));
        assert_eq!(split_track_number("12. Song"), (Some(12), "Song".into()));
        assert_eq!(split_track_number("7_Name"), (Some(7), "Name".into()));
        assert_eq!(split_track_number("1999"), (None, "1999".into()));
        assert_eq!(split_track_number("2024 Year Of"), (None, "2024 Year Of".into()));
        assert_eq!(split_track_number("Plain"), (None, "Plain".into()));
    }

    #[test]
    fn identifiers_are_stable_and_safe() {
        assert_eq!(stable_hash("Album/01 Song.mp3"), stable_hash("Album/01 Song.mp3"));
        assert_ne!(stable_hash("a.mp3"), stable_hash("b.mp3"));
        assert_eq!(file_stem_for("al-1/../../etc"), "al-1_______etc");
    }

    #[test]
    fn content_type_picks_the_extension() {
        assert_eq!(extension_for("audio/mpeg"), "mp3");
        assert_eq!(extension_for("audio/flac; charset=binary"), "flac");
        assert_eq!(extension_for("audio/vnd.wave"), "wav");
    }
}

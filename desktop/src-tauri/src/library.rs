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
    /// Обложка, скачанная вместе с треком: без неё офлайн-библиотека выглядит пустыми квадратами.
    cover: Option<String>,
    automatic: bool,
    size: u64,
}

fn error(context: &str, error: impl std::fmt::Display) -> String {
    format!("{context}: {error}")
}

pub fn music_folder(app: &AppHandle) -> Result<PathBuf, String> {
    let folder = app.path().audio_dir().map_err(|e| error("папка музыки", e))?.join("Nocturne");
    fs::create_dir_all(&folder).map_err(|e| error("папка музыки", e))?;
    Ok(folder)
}

fn downloads_folder(app: &AppHandle, account: &str) -> Result<PathBuf, String> {
    let folder = app.path().app_local_data_dir().map_err(|e| error("загрузки", e))?.join("downloads").join(stable_hash(account));
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
    let legacy = app.path().app_local_data_dir().map_err(|e| error("загрузки", e))?.join("downloads");
    tauri::async_runtime::spawn_blocking(move || {
        let mut tracks: Vec<LocalTrack> = audio_files(&root).iter().map(|path| read_track(&root, path, &covers)).collect();
        // Старые файлы доступны как локальные: неизвестному серверу их приписывать нельзя.
        if legacy.exists() {
            for download in collect_downloads(&legacy).unwrap_or_default() {
                let title = download.song.get("title").and_then(Value::as_str).unwrap_or("Music").to_string();
                tracks.push(LocalTrack { id: format!("local:legacy:{}", stable_hash(&download.path)), path: download.path, title,
                    artist: download.song.get("artist").and_then(Value::as_str).map(str::to_string),
                    album: download.song.get("album").and_then(Value::as_str).map(str::to_string),
                    track: download.song.get("track").and_then(Value::as_u64).map(|n| n as u32),
                    duration: download.song.get("duration").and_then(Value::as_f64), cover: download.cover });
            }
        }
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
        let legacy = app.path().app_local_data_dir().map_err(|e| error("загрузки", e))?.join("downloads").canonicalize().map_err(|e| error("загрузки", e))?;
        // Только файл непосредственно в старом корне; новые аккаунтные папки сюда не входят.
        if target.parent() != Some(legacy.as_path()) { return Err("файл вне папки музыки".into()); }
        let stem = target.file_stem().and_then(|stem| stem.to_str()).ok_or("неверный файл")?;
        return remove_files_of(&legacy, stem);
    }
    fs::remove_file(target).map_err(|e| error("удаление", e))
}

/// Идентификатор сервера превращаем в безопасное имя файла.
fn file_stem_for(id: &str) -> String {
    let label: String = id.chars().take(64).map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect();
    format!("{}-{label}", stable_hash(id))
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
pub async fn download_track(
    app: AppHandle,
    url: String,
    id: String,
    account: String,
    mut song: Value,
    automatic: Option<bool>,
    limit_bytes: Option<u64>,
    cover_url: Option<String>,
) -> Result<Download, String> {
    if account.is_empty() { return Err("не указан владелец загрузки".into()); }
    let automatic = automatic.unwrap_or(false);
    if automatic && !crate::network::unmetered() { return Err("ожидание неограниченной сети".into()); }
    if let Some(meta) = song.as_object_mut() { meta.insert("_nocturneAutomatic".into(), Value::Bool(automatic)); }
    let folder = downloads_folder(&app, &account)?;
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
    if response.content_length().zip(limit_bytes).is_some_and(|(size, limit)| size > limit) {
        return Err("достигнут лимит места".into());
    }
    let partial = folder.join(format!("{stem}.part"));
    let mut file = tokio::fs::File::create(&partial).await.map_err(|e| error("файл", e))?;
    let mut body = response.bytes_stream();
    let mut size = 0u64;
    while let Some(chunk) = body.next().await {
        let chunk = chunk.map_err(|e| error("загрузка", e))?;
        if automatic && !crate::network::unmetered() {
            drop(file); let _ = tokio::fs::remove_file(&partial).await;
            return Err("ожидание неограниченной сети".into());
        }
        size += chunk.len() as u64;
        if limit_bytes.is_some_and(|limit| size > limit) {
            drop(file);
            let _ = tokio::fs::remove_file(&partial).await;
            return Err("достигнут лимит места".into());
        }
        file.write_all(&chunk).await.map_err(|e| error("запись", e))?;
    }
    file.flush().await.map_err(|e| error("запись", e))?;
    drop(file);

    let target = folder.join(format!("{stem}.{}", extension_for(&content_type)));
    tokio::fs::rename(&partial, &target).await.map_err(|e| error("файл", e))?;
    let meta = serde_json::to_vec(&song).map_err(|e| error("метаданные", e))?;
    tokio::fs::write(folder.join(format!("{stem}.json")), meta).await.map_err(|e| error("метаданные", e))?;
    // Обложку кладём рядом: без сети серверный адрес не откроется, а файл — откроется.
    let cover = match cover_url {
        Some(address) => save_cover(&folder.join(format!("{stem}.cover")), &address).await,
        None => None,
    };
    Ok(Download { id, path: target.to_string_lossy().to_string(), song, cover, automatic, size })
}

/// Обложка — украшение: не дошла, и ничего страшного, трек всё равно скачан.
async fn save_cover(target: &Path, url: &str) -> Option<String> {
    let response = reqwest::get(url).await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let bytes = response.bytes().await.ok()?;
    tokio::fs::write(target, &bytes).await.ok()?;
    Some(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn downloads(app: AppHandle, account: String) -> Result<Vec<Download>, String> {
    collect_downloads(&downloads_folder(&app, &account)?)
}

fn collect_downloads(folder: &Path) -> Result<Vec<Download>, String> {
    // Чтение списка не удаляет .part: в этот момент другой запрос может писать файл.
    let mut result = Vec::new();
    let entries = fs::read_dir(folder).map_err(|e| error("загрузки", e))?;
    let files: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
    let audio: HashSet<&PathBuf> =
        files.iter().filter(|p| p.extension().is_some_and(|e| e != "json" && e != "part" && e != "cover")).collect();
    for meta in files.iter().filter(|p| p.extension().is_some_and(|e| e == "json")) {
        let Ok(text) = fs::read_to_string(meta) else { continue };
        let Ok(song) = serde_json::from_str::<Value>(&text) else { continue };
        let Some(id) = song.get("id").and_then(Value::as_str).map(str::to_string) else { continue };
        let stem = meta.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        // Без аудиофайла метаданные бесполезны — такую загрузку считаем несостоявшейся.
        let Some(path) = audio.iter().find(|p| p.file_stem().is_some_and(|s| s.to_string_lossy() == stem)) else { continue };
        let cover = folder.join(format!("{stem}.cover"));
        let cover = cover.exists().then(|| cover.to_string_lossy().to_string());
        let automatic = song.get("_nocturneAutomatic").and_then(Value::as_bool).unwrap_or(false);
        let size = fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);
        result.push(Download { id, path: path.to_string_lossy().to_string(), song, cover, automatic, size });
    }
    Ok(result)
}

#[tauri::command]
pub fn remove_download(app: AppHandle, id: String, account: String) -> Result<(), String> {
    remove_files_of(&downloads_folder(&app, &account)?, &file_stem_for(&id))
}

/// Удаляет трек, его метаданные и обложку. На Windows файл, который сейчас открыт (играет или
/// заранее загружен как следующий), удалить нельзя — об этом надо сказать, а не делать вид, что
/// получилось: иначе загрузка «вернётся» после перезапуска. Аудио удаляется первым, чтобы при
/// отказе метаданные остались на месте и загрузка не превратилась в огрызок.
fn remove_files_of(folder: &Path, stem: &str) -> Result<(), String> {
    let mut files: Vec<PathBuf> = fs::read_dir(folder)
        .map_err(|e| error("загрузки", e))?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.file_stem().is_some_and(|s| s.to_string_lossy() == stem))
        .collect();
    files.sort_by_key(|path| path.extension().is_some_and(|e| e == "json" || e == "cover"));
    for path in files {
        fs::remove_file(&path).map_err(|e| error("удаление", e))?;
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
        assert!(!file_stem_for("al-1/../../etc").contains('/'));
        assert_ne!(file_stem_for("a/b"), file_stem_for("a_b"));
    }

    #[test]
    fn account_folders_and_automatic_metadata_are_independent() {
        let root = std::env::temp_dir().join(format!("nocturne-accounts-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let a = root.join(stable_hash("alice@https://a"));
        let b = root.join(stable_hash("alice@https://b"));
        for (folder, title, automatic) in [(&a, "A", true), (&b, "B", false)] {
            fs::create_dir_all(folder).unwrap();
            fs::write(folder.join("same.mp3"), b"audio").unwrap();
            fs::write(folder.join("same.json"), serde_json::json!({"id":"same", "title":title, "_nocturneAutomatic":automatic}).to_string()).unwrap();
        }
        let left = collect_downloads(&a).unwrap();
        let right = collect_downloads(&b).unwrap();
        assert_eq!(left[0].song["title"], "A");
        assert_eq!(right[0].song["title"], "B");
        assert!(left[0].automatic);
        assert!(!right[0].automatic);
        remove_files_of(&a, "same").unwrap();
        assert_eq!(collect_downloads(&b).unwrap().len(), 1);
        let _ = fs::remove_dir_all(root);
    }

    /// Обложка лежит рядом с треком и не должна сойти за сам трек: расширения у них разные.
    #[test]
    fn a_download_reports_the_cover_next_to_it() {
        let folder = std::env::temp_dir().join(format!("nocturne-downloads-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("t1.json"), r#"{"id":"t1","title":"Песня","coverArt":"al-1"}"#).unwrap();
        fs::write(folder.join("t1.mp3"), b"audio").unwrap();
        fs::write(folder.join("t1.cover"), b"image").unwrap();
        fs::write(folder.join("t2.json"), r#"{"id":"t2","title":"Без обложки"}"#).unwrap();
        fs::write(folder.join("t2.mp3"), b"audio").unwrap();
        fs::write(folder.join("t3.part"), "половина").unwrap();

        let mut found = collect_downloads(&folder).unwrap();
        found.sort_by(|a, b| a.id.cmp(&b.id));
        assert_eq!(found.len(), 2);
        assert!(found[0].path.ends_with("t1.mp3"));
        assert!(found[0].cover.as_ref().is_some_and(|cover| cover.ends_with("t1.cover")));
        assert!(found[1].path.ends_with("t2.mp3"));
        assert_eq!(found[1].cover, None);
        assert!(folder.join("t3.part").exists(), "чтение списка не должно удалять файл активной загрузки");
        let _ = fs::remove_dir_all(&folder);
    }

    #[test]
    fn removing_a_download_takes_the_audio_first() {
        let folder = std::env::temp_dir().join(format!("nocturne-remove-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        for name in ["t1.json", "t1.mp3", "t1.cover", "t10.mp3"] {
            fs::write(folder.join(name), b"x").unwrap();
        }
        remove_files_of(&folder, "t1").unwrap();
        let left: Vec<_> = fs::read_dir(&folder).unwrap().flatten().map(|e| e.file_name()).collect();
        assert_eq!(left, vec![std::ffi::OsString::from("t10.mp3")], "чужая загрузка с похожим именем должна остаться");
        let _ = fs::remove_dir_all(&folder);
    }

    #[test]
    fn content_type_picks_the_extension() {
        assert_eq!(extension_for("audio/mpeg"), "mp3");
        assert_eq!(extension_for("audio/flac; charset=binary"), "flac");
        assert_eq!(extension_for("audio/vnd.wave"), "wav");
    }
}

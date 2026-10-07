//! Всё, чем приложение встраивается в Windows, а не просто открывает окно с веб-страницей:
//!
//! - системный плеер (SMTC): медиаклавиши, плашка над регулятором громкости и на экране блокировки
//!   с обложкой, названием и перемоткой;
//! - кнопки «назад / играть / вперёд» в превью окна на панели задач, как у проигрывателя Windows;
//! - цвет акцента из настроек Windows и признак Windows 11 (для фона Mica);
//! - WebView2 без браузерных клавиш: F5, Ctrl+R, Ctrl+P и прочие не должны превращать окно в браузер.
//!
//! Нажатия кнопок уходят в окно событием `media-command` — там же, где их обрабатывает плеер.

use std::cell::RefCell;
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use windows::core::{factory, HSTRING};
use windows::Foundation::{TimeSpan, TypedEventHandler, Uri};
use windows::Media::{
    MediaPlaybackStatus, MediaPlaybackType, PlaybackPositionChangeRequestedEventArgs, SystemMediaTransportControls,
    SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs,
    SystemMediaTransportControlsTimelineProperties,
};
use windows::Storage::StorageFile;
use windows::Storage::Streams::RandomAccessStreamReference;
use windows::UI::ViewManagement::{UIColorType, UISettings};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{CreateBitmap, CreateDIBSection, DeleteObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;
use windows::Win32::UI::Shell::{
    DefSubclassProc, ITaskbarList3, SetWindowSubclass, TaskbarList, THBF_ENABLED, THBN_CLICKED, THB_FLAGS, THB_ICON, THB_TOOLTIP,
    THUMBBUTTON,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateIconIndirect, GetSystemMetrics, RegisterWindowMessageW, HICON, ICONINFO, SM_CXSMICON, WM_COMMAND,
};

use crate::glyphs::{self, Glyph};

#[derive(Clone, Serialize)]
struct MediaCommand {
    action: &'static str,
    position: Option<f64>,
}

static APP: OnceLock<AppHandle> = OnceLock::new();

fn emit(action: &'static str, position: Option<f64>) {
    if let Some(app) = APP.get() {
        let _ = app.emit("media-command", MediaCommand { action, position });
    }
}

/// Системный плеер и подписка на смену цвета акцента. Объекты WinRT здесь «гибкие» (agile):
/// их можно трогать из любого потока, поэтому они живут в общем состоянии.
pub struct Shell {
    controls: Mutex<Option<SystemMediaTransportControls>>,
    ui_settings: Mutex<Option<UISettings>>,
}

/// Кнопки в превью — объект COM главного потока: к нему ходим только оттуда.
struct Thumbs {
    taskbar: Option<ITaskbarList3>,
    hwnd: HWND,
    added: bool,
    playing: bool,
    tooltips: [String; 3],
    icons: Vec<(Glyph, HICON)>,
}

thread_local! {
    static THUMBS: RefCell<Option<Thumbs>> = const { RefCell::new(None) };
}

const ID_PREVIOUS: u32 = 1;
const ID_TOGGLE: u32 = 2;
const ID_NEXT: u32 = 3;

pub fn setup(app: &AppHandle, window: &WebviewWindow) {
    let _ = APP.set(app.clone());
    #[cfg(not(debug_assertions))]
    disable_browser_keys(window);

    let hwnd = match window.hwnd() {
        Ok(hwnd) => HWND(hwnd.0),
        Err(_) => return,
    };
    let controls = media_controls(hwnd).ok();
    app.manage(Shell { controls: Mutex::new(controls), ui_settings: Mutex::new(watch_accent()) });
    install_thumbs(hwnd);
}

/// В отладочной сборке клавиши разработчика нужны, в релизе — нет.
#[cfg(not(debug_assertions))]
fn disable_browser_keys(window: &WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows::core::Interface;
    let _ = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let Ok(settings) = core.Settings() else { return };
        // Строка состояния со ссылкой внизу окна — тоже примета браузера.
        let _ = settings.SetIsStatusBarEnabled(false);
        if let Ok(settings) = settings.cast::<ICoreWebView2Settings3>() {
            let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
        }
    });
}

// MARK: - Системный плеер (SMTC)

fn media_controls(hwnd: HWND) -> windows::core::Result<SystemMediaTransportControls> {
    let interop = factory::<SystemMediaTransportControls, ISystemMediaTransportControlsInterop>()?;
    let controls: SystemMediaTransportControls = unsafe { interop.GetForWindow(hwnd)? };
    controls.SetIsEnabled(true)?;
    controls.SetIsPlayEnabled(true)?;
    controls.SetIsPauseEnabled(true)?;
    controls.SetIsNextEnabled(true)?;
    controls.SetIsPreviousEnabled(true)?;
    controls.SetPlaybackStatus(MediaPlaybackStatus::Closed)?;
    controls.ButtonPressed(&TypedEventHandler::<SystemMediaTransportControls, SystemMediaTransportControlsButtonPressedEventArgs>::new(
        |_, args| {
            let action = match args.ok()?.Button()? {
                SystemMediaTransportControlsButton::Play => "play",
                SystemMediaTransportControlsButton::Pause => "pause",
                SystemMediaTransportControlsButton::Next => "next",
                SystemMediaTransportControlsButton::Previous => "previous",
                SystemMediaTransportControlsButton::Stop => "pause",
                _ => return Ok(()),
            };
            emit(action, None);
            Ok(())
        },
    ))?;
    controls.PlaybackPositionChangeRequested(&TypedEventHandler::<SystemMediaTransportControls, PlaybackPositionChangeRequestedEventArgs>::new(
        |_, args| {
            let position = args.ok()?.RequestedPlaybackPosition()?;
            emit("seek", Some(position.Duration as f64 / 10_000_000.0));
            Ok(())
        },
    ))?;
    Ok(controls)
}

fn span(seconds: f64) -> TimeSpan {
    TimeSpan { Duration: (seconds.max(0.0) * 10_000_000.0) as i64 }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    title: String,
    artist: Option<String>,
    album: Option<String>,
    /// Обложка с сервера: Windows скачает её сама.
    cover_url: Option<String>,
    /// Обложка на диске: своя музыка и загрузки.
    cover_path: Option<String>,
}

fn thumbnail(song: &NowPlaying) -> Option<RandomAccessStreamReference> {
    if let Some(path) = &song.cover_path {
        let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(path.as_str())).ok()?.join().ok()?;
        return RandomAccessStreamReference::CreateFromFile(&file).ok();
    }
    let url = song.cover_url.as_deref().filter(|url| url.starts_with("http"))?;
    RandomAccessStreamReference::CreateFromUri(&Uri::CreateUri(&HSTRING::from(url)).ok()?).ok()
}

fn update_metadata(controls: &SystemMediaTransportControls, song: &NowPlaying) -> windows::core::Result<()> {
    let updater = controls.DisplayUpdater()?;
    updater.ClearAll()?;
    updater.SetType(MediaPlaybackType::Music)?;
    let music = updater.MusicProperties()?;
    music.SetTitle(&HSTRING::from(song.title.as_str()))?;
    music.SetArtist(&HSTRING::from(song.artist.as_deref().unwrap_or_default()))?;
    music.SetAlbumTitle(&HSTRING::from(song.album.as_deref().unwrap_or_default()))?;
    if let Some(picture) = thumbnail(song) {
        updater.SetThumbnail(&picture)?;
    }
    updater.Update()
}

/// Что играет: название, исполнитель, обложка — для плашки громкости и экрана блокировки.
#[tauri::command]
pub async fn media_metadata(app: AppHandle, song: NowPlaying) -> Result<(), String> {
    // Файл обложки открывается асинхронно, а мы ждём его здесь, вне главного потока окна.
    tauri::async_runtime::spawn_blocking(move || {
        let shell = app.state::<Shell>();
        let controls = shell.controls.lock().map_err(|e| e.to_string())?;
        let Some(controls) = controls.as_ref() else { return Ok(()) };
        update_metadata(controls, &song).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Играет ли сейчас и где: для системного плеера и для кнопки в превью на панели задач.
#[tauri::command]
pub fn media_state(app: AppHandle, playing: bool, active: bool, position: f64, duration: f64) {
    if let Ok(controls) = app.state::<Shell>().controls.lock() {
        if let Some(controls) = controls.as_ref() {
            let status = match (active, playing) {
                (false, _) => MediaPlaybackStatus::Closed,
                (true, true) => MediaPlaybackStatus::Playing,
                (true, false) => MediaPlaybackStatus::Paused,
            };
            let _ = controls.SetPlaybackStatus(status);
            if duration.is_finite() && duration > 0.0 {
                if let Ok(timeline) = SystemMediaTransportControlsTimelineProperties::new() {
                    let _ = timeline.SetStartTime(span(0.0));
                    let _ = timeline.SetMinSeekTime(span(0.0));
                    let _ = timeline.SetEndTime(span(duration));
                    let _ = timeline.SetMaxSeekTime(span(duration));
                    let _ = timeline.SetPosition(span(position.min(duration)));
                    let _ = controls.UpdateTimelineProperties(&timeline);
                }
            }
        }
    }
    let _ = app.run_on_main_thread(move || {
        THUMBS.with(|thumbs| {
            if let Some(thumbs) = thumbs.borrow_mut().as_mut() {
                thumbs.playing = playing;
                thumbs.update();
            }
        })
    });
}

/// Подписи кнопок в превью — на языке интерфейса, поэтому их присылает окно.
#[tauri::command]
pub fn taskbar_labels(app: AppHandle, previous: String, play: String, pause: String, next: String) {
    let _ = app.run_on_main_thread(move || {
        THUMBS.with(|thumbs| {
            if let Some(thumbs) = thumbs.borrow_mut().as_mut() {
                thumbs.tooltips = [previous, format!("{play}\u{0}{pause}"), next];
                thumbs.update();
            }
        })
    });
}

// MARK: - Цвет акцента и стиль окна

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeStyle {
    platform: &'static str,
    /// Windows 11: под окном есть Mica, и фон можно оставить прозрачным.
    mica: bool,
    accent: Option<Accent>,
}

#[derive(Clone, Serialize)]
pub struct Accent {
    /// Заливки (кнопки, ползунки) — SystemAccentColorLight2, как у WinUI в тёмной теме.
    fill: String,
    /// Текст и ссылки — SystemAccentColorLight3.
    text: String,
}

fn hex(color: windows::UI::Color) -> String {
    format!("#{:02x}{:02x}{:02x}", color.R, color.G, color.B)
}

fn accent(settings: &UISettings) -> Option<Accent> {
    Some(Accent {
        fill: hex(settings.GetColorValue(UIColorType::AccentLight2).ok()?),
        text: hex(settings.GetColorValue(UIColorType::AccentLight3).ok()?),
    })
}

/// Человек сменил цвет в «Параметрах» — окно перекрашивается сразу, без перезапуска.
fn watch_accent() -> Option<UISettings> {
    let settings = UISettings::new().ok()?;
    let _ = settings.ColorValuesChanged(&TypedEventHandler::<UISettings, windows::core::IInspectable>::new(|sender, _| {
        if let (Some(app), Ok(sender)) = (APP.get(), sender.ok()) {
            if let Some(accent) = accent(sender) {
                let _ = app.emit("accent-changed", accent);
            }
        }
        Ok(())
    }));
    Some(settings)
}

#[tauri::command]
pub fn native_style(app: AppHandle) -> NativeStyle {
    let accent = app
        .state::<Shell>()
        .ui_settings
        .lock()
        .ok()
        .and_then(|settings| settings.as_ref().and_then(accent));
    NativeStyle { platform: "windows", mica: windows_version::OsVersion::current().build >= 22000, accent }
}

// MARK: - Кнопки в превью на панели задач

unsafe fn icon(glyph: Glyph, size: i32) -> Option<HICON> {
    let pixels = glyphs::render(glyph, size as u32);
    let mut header = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: size,
        biHeight: -size,
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
    };
    header.biSizeImage = (size * size * 4) as u32;
    let info = BITMAPINFO { bmiHeader: header, ..Default::default() };
    let mut bits = std::ptr::null_mut();
    let color = CreateDIBSection(None, &info, DIB_RGB_COLORS, &mut bits, None, 0).ok()?;
    std::ptr::copy_nonoverlapping(pixels.as_ptr(), bits as *mut u8, pixels.len());
    let mask = CreateBitmap(size, size, 1, 1, None);
    let info = ICONINFO { fIcon: true.into(), xHotspot: 0, yHotspot: 0, hbmMask: mask, hbmColor: color };
    let icon = CreateIconIndirect(&info).ok();
    let _ = DeleteObject(HGDIOBJ(color.0));
    let _ = DeleteObject(HGDIOBJ(mask.0));
    icon
}

fn wide<const N: usize>(text: &str) -> [u16; N] {
    let mut buffer = [0u16; N];
    for (slot, unit) in buffer.iter_mut().take(N - 1).zip(text.encode_utf16()) {
        *slot = unit;
    }
    buffer
}

impl Thumbs {
    fn icon(&self, glyph: Glyph) -> HICON {
        self.icons.iter().find(|(g, _)| *g == glyph).map(|(_, icon)| *icon).unwrap_or_default()
    }

    fn buttons(&self) -> [THUMBBUTTON; 3] {
        let (play, pause) = self.tooltips[1].split_once('\u{0}').unwrap_or(("", ""));
        let button = |id: u32, glyph: Glyph, tip: &str| THUMBBUTTON {
            dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
            iId: id,
            hIcon: self.icon(glyph),
            szTip: wide(tip),
            dwFlags: THBF_ENABLED,
            ..Default::default()
        };
        [
            button(ID_PREVIOUS, Glyph::Previous, &self.tooltips[0]),
            if self.playing { button(ID_TOGGLE, Glyph::Pause, pause) } else { button(ID_TOGGLE, Glyph::Play, play) },
            button(ID_NEXT, Glyph::Next, &self.tooltips[2]),
        ]
    }

    /// Кнопки добавляются один раз, когда у окна появилась кнопка на панели задач; дальше — только обновляются.
    fn update(&mut self) {
        let Some(taskbar) = self.taskbar.as_ref() else { return };
        let buttons = self.buttons();
        unsafe {
            if self.added {
                let _ = taskbar.ThumbBarUpdateButtons(self.hwnd, &buttons);
            } else if taskbar.ThumbBarAddButtons(self.hwnd, &buttons).is_ok() {
                self.added = true;
            }
        }
    }
}

static TASKBAR_CREATED: OnceLock<u32> = OnceLock::new();

unsafe extern "system" fn window_proc(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _data: usize) -> LRESULT {
    if Some(&message) == TASKBAR_CREATED.get() {
        // Explorer перезапустился или кнопка окна появилась только сейчас — ставим кнопки заново.
        THUMBS.with(|thumbs| {
            if let Some(thumbs) = thumbs.borrow_mut().as_mut() {
                thumbs.added = false;
                thumbs.update();
            }
        });
    } else if message == WM_COMMAND && (wparam.0 >> 16) as u32 == THBN_CLICKED {
        match (wparam.0 & 0xffff) as u32 {
            ID_PREVIOUS => emit("previous", None),
            ID_TOGGLE => emit("toggle", None),
            ID_NEXT => emit("next", None),
            _ => {}
        }
        return LRESULT(0);
    }
    DefSubclassProc(hwnd, message, wparam, lparam)
}

fn install_thumbs(hwnd: HWND) {
    unsafe {
        let _ = TASKBAR_CREATED.set(RegisterWindowMessageW(windows::core::w!("TaskbarButtonCreated")));
        let taskbar: Option<ITaskbarList3> = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER).ok();
        if let Some(taskbar) = &taskbar {
            let _ = taskbar.HrInit();
        }
        let size = GetSystemMetrics(SM_CXSMICON).max(16);
        let icons = [Glyph::Previous, Glyph::Play, Glyph::Pause, Glyph::Next]
            .into_iter()
            .filter_map(|glyph| icon(glyph, size).map(|icon| (glyph, icon)))
            .collect();
        let mut thumbs = Thumbs {
            taskbar,
            hwnd,
            added: false,
            playing: false,
            tooltips: ["Previous".into(), "Play\u{0}Pause".into(), "Next".into()],
            icons,
        };
        // Окно уже могло получить кнопку на панели задач до нас — тогда сообщения о ней не будет.
        thumbs.update();
        THUMBS.with(|slot| *slot.borrow_mut() = Some(thumbs));
        let _ = SetWindowSubclass(hwnd, Some(window_proc), 0x4e6f63, 0);
    }
}

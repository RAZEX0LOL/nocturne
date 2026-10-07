//! Трей и глобальные сочетания клавиш — то, что работает, когда окна не видно.
//!
//! Значок в трее есть на Windows и Linux: там музыкальный плеер принято сворачивать в трей.
//! На Mac трея нет — как у «Музыки» Apple: закрытое окно прячется, приложение остаётся в Dock,
//! клик по значку в Dock возвращает окно.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

/// Закрытие окна сворачивает в трей, а не выходит. На Mac окно прячется всегда.
pub static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);

/// Глобальные сочетания: работают в любом приложении, пока Nocturne запущен.
pub const SHORTCUTS: &[(&str, &str)] = &[
    ("CommandOrControl+Alt+Space", "toggle"),
    ("CommandOrControl+Alt+ArrowRight", "next"),
    ("CommandOrControl+Alt+ArrowLeft", "previous"),
    ("CommandOrControl+Alt+ArrowUp", "volumeUp"),
    ("CommandOrControl+Alt+ArrowDown", "volumeDown"),
];

#[derive(Clone, serde::Serialize)]
struct MediaCommand {
    action: &'static str,
    position: Option<f64>,
}

fn send<R: Runtime>(app: &AppHandle<R>, action: &'static str) {
    let _ = app.emit_to("main", "media-command", MediaCommand { action, position: None });
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Обработчик глобальных сочетаний: какое нажато — такую команду и получает плеер.
pub fn on_shortcut<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state() != ShortcutState::Pressed {
        return;
    }
    let pressed = shortcut.into_string();
    if let Some((_, action)) =
        SHORTCUTS.iter().find(|(keys, _)| keys.parse::<Shortcut>().is_ok_and(|known| known.into_string() == pressed))
    {
        send(app, action);
    }
}

#[tauri::command]
pub fn set_global_shortcuts<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Result<(), String> {
    let manager = app.global_shortcut();
    manager.unregister_all().map_err(|error| error.to_string())?;
    if enabled {
        // Сочетание может быть уже занято другой программой — остальные всё равно регистрируем.
        for (keys, _) in SHORTCUTS {
            let _ = manager.register(*keys);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
}

#[cfg(not(target_os = "macos"))]
mod icon {
    use super::*;
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    /// Пункты меню трея меняют подписи вместе с языком и состоянием плеера.
    pub struct TrayItems<R: Runtime> {
        toggle: MenuItem<R>,
        previous: MenuItem<R>,
        next: MenuItem<R>,
        show: MenuItem<R>,
        quit: MenuItem<R>,
    }

    pub fn setup<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
        let toggle = MenuItem::with_id(app, "toggle", "Play", true, None::<&str>)?;
        let previous = MenuItem::with_id(app, "previous", "Previous", true, None::<&str>)?;
        let next = MenuItem::with_id(app, "next", "Next", true, None::<&str>)?;
        let show = MenuItem::with_id(app, "show", "Show Nocturne", true, None::<&str>)?;
        let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
        let separator = PredefinedMenuItem::separator(app)?;
        let menu = Menu::with_items(app, &[&toggle, &previous, &next, &separator, &show, &quit])?;
        let mut builder = TrayIconBuilder::with_id("main")
            .tooltip("Nocturne")
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| match event.id.as_ref() {
                "toggle" => send(app, "toggle"),
                "previous" => send(app, "previous"),
                "next" => send(app, "next"),
                "show" => show_main(app),
                "quit" => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                // Левый клик по значку — вернуть окно, как у любого приложения в трее.
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                    show_main(tray.app_handle());
                }
            });
        if let Some(icon) = app.default_window_icon() {
            builder = builder.icon(icon.clone());
        }
        builder.build(app)?;
        app.manage(TrayItems { toggle, previous, next, show, quit });
        Ok(())
    }

    pub fn update<R: Runtime>(app: &AppHandle<R>, labels: &super::TrayLabels, playing: bool, title: Option<&str>) {
        if let Some(items) = app.try_state::<TrayItems<R>>() {
            let _ = items.toggle.set_text(if playing { &labels.pause } else { &labels.play });
            let _ = items.previous.set_text(&labels.previous);
            let _ = items.next.set_text(&labels.next);
            let _ = items.show.set_text(&labels.show);
            let _ = items.quit.set_text(&labels.quit);
        }
        if let Some(tray) = app.tray_by_id("main") {
            let _ = tray.set_tooltip(Some(title.map_or_else(|| "Nocturne".to_string(), |title| format!("{title} — Nocturne"))));
        }
    }
}

pub fn setup<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(not(target_os = "macos"))]
    if let Err(error) = icon::setup(app) {
        eprintln!("трей не создан: {error}");
    }
    #[cfg(target_os = "macos")]
    let _ = app;
}

// На Mac трея нет — подписи приходят, но не нужны.
#[cfg_attr(target_os = "macos", allow(dead_code))]
#[derive(Deserialize)]
pub struct TrayLabels {
    play: String,
    pause: String,
    previous: String,
    next: String,
    show: String,
    quit: String,
}

/// Подписи меню трея (на языке интерфейса), состояние плеера и трек во всплывающей подсказке.
#[tauri::command]
pub fn tray_update<R: Runtime>(app: AppHandle<R>, labels: TrayLabels, playing: bool, title: Option<String>) {
    #[cfg(not(target_os = "macos"))]
    icon::update(&app, &labels, playing, title.as_deref());
    #[cfg(target_os = "macos")]
    let _ = (app, labels, playing, title);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Строки сочетаний разбираются — иначе register молча не сработал бы ни на одной системе.
    #[test]
    fn every_shortcut_parses_and_is_unique() {
        let parsed: Vec<String> = SHORTCUTS.iter().map(|(keys, _)| keys.parse::<Shortcut>().expect(keys).into_string()).collect();
        let mut unique = parsed.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(unique.len(), SHORTCUTS.len());
    }
}

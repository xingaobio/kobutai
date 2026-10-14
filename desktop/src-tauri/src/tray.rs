//! System tray: show/hide the character, start at login, quit. Contract: docs/development/DESKTOP.md section 4.4.

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use crate::{logic, overlay};

const ID_TOGGLE: &str = "toggle";
const ID_AUTOSTART: &str = "autostart";
const ID_QUIT: &str = "quit";

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let labels = logic::labels_for_locale(sys_locale::get_locale().as_deref());
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);

    let toggle = MenuItem::with_id(app, ID_TOGGLE, labels.show_hide, true, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(app, ID_AUTOSTART, labels.autostart, true, autostart_on, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, ID_QUIT, labels.quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &autostart, &separator, &quit])?;

    let autostart_item = autostart.clone();
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Kobutai")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            ID_TOGGLE => overlay::toggle(app),
            ID_AUTOSTART => toggle_autostart(app, &autostart_item),
            ID_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                overlay::toggle(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// The check mark has already flipped when this runs; apply it, then show what the OS really has.
fn toggle_autostart(app: &AppHandle, item: &CheckMenuItem<tauri::Wry>) {
    let want = item.is_checked().unwrap_or(false);
    let manager = app.autolaunch();
    let result = if want { manager.enable() } else { manager.disable() };
    if let Err(e) = result {
        eprintln!("[tray] changing autostart failed: {e}");
    }
    let _ = item.set_checked(manager.is_enabled().unwrap_or(!want));
}

// No console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod media;
mod overlay;
mod tray;

// Pure logic and wire types are in the library target (src/lib.rs); the modules above refer to them as `crate::logic` / `crate::payload`.
use kobutai_core::{logic, payload};
use tauri_plugin_autostart::MacosLauncher;

fn main() {
    tauri::Builder::default()
        // Must be registered first: a second launch only brings the overlay back.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            overlay::show(app)
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .manage(overlay::HitRegions::default())
        .invoke_handler(tauri::generate_handler![
            media::media_sessions,
            media::media_command,
            overlay::set_hit_regions
        ])
        .setup(|app| {
            let handle = app.handle();
            media::start(handle);
            tray::create(handle)?;
            overlay::start(handle)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Kobutai");
}

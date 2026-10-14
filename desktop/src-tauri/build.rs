fn main() {
    // Scope the app's own commands: with an app manifest Tauri generates an
    // `allow-<command>` permission for each one, so the capability file can
    // grant them individually instead of exposing every command to the webview.
    let attrs = tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
        "media_sessions",
        "media_command",
        "set_hit_regions",
    ]));
    tauri_build::try_build(attrs).expect("failed to run tauri-build");
}

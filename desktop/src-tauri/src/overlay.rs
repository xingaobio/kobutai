//! The "overlay" window: fitted to the primary monitor's work area, click-through
//! except over the front end's interactive rectangles, and never taking keyboard focus.
//! Contract: docs/development/DESKTOP.md section 4.3, 4.4 (event `overlay://cursor`), 4.5.

use std::sync::{Arc, Mutex, MutexGuard};

use tauri::{AppHandle, Manager, State, WebviewWindow, WindowEvent};

use crate::logic::Rect;
use crate::payload::HitRect;

/// Window label from tauri.conf.json.
pub const LABEL: &str = "overlay";

/// Event carrying a `CursorPayload`; emitted to the overlay window whenever click-through flips, and once at start-up.
#[cfg_attr(not(windows), allow(dead_code))]
pub const CURSOR_EVENT: &str = "overlay://cursor";

/// Windows only: give the overlay `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW` so clicking it never takes focus from the
/// app the user is typing in, and keep it out of Alt+Tab. Switch this off if WebView2 input misbehaves.
///
/// RISK TO VERIFY ON WINDOWS: with WS_EX_NOACTIVATE the window never becomes the foreground window, so check that
/// clicks on the character and control bar, hover, and slider/progress drags still reach WebView2 (they should:
/// mouse input does not require activation, only keyboard input does). If not, set this to `false`.
pub const NO_ACTIVATE: bool = true;

/// Interactive rectangles (logical CSS pixels, relative to the window), shared with the cursor poller.
#[derive(Clone, Default)]
pub struct HitRegions(Arc<Mutex<Vec<Rect>>>);

impl HitRegions {
    fn lock(&self) -> MutexGuard<'_, Vec<Rect>> {
        // The data is plain numbers; a poisoned lock is still usable.
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Replace the interactive rectangles. An empty list makes the whole window click-through.
#[tauri::command]
pub fn set_hit_regions(regions: State<'_, HitRegions>, rects: Vec<HitRect>) -> Result<(), String> {
    *regions.lock() = rects.into_iter().map(Rect::from).collect();
    Ok(())
}

pub fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// Fit the window to the work area and show it.
pub fn show(app: &AppHandle) {
    let Some(w) = window(app) else { return };
    if let Err(e) = platform::fit(&w) {
        eprintln!("[overlay] cannot fit to the work area: {e}");
    }
    // Never `w.show()` on Windows: it can activate the window. See `platform::show_without_activation`.
    if let Err(e) = platform::show_without_activation(&w) {
        eprintln!("[overlay] show failed: {e}");
    }
}

pub fn hide(app: &AppHandle) {
    if let Some(w) = window(app) {
        if let Err(e) = w.hide() {
            eprintln!("[overlay] hide failed: {e}");
        }
    }
}

pub fn toggle(app: &AppHandle) {
    match window(app).map(|w| w.is_visible()) {
        Some(Ok(true)) => hide(app),
        Some(_) => show(app),
        None => {}
    }
}

/// Set up the overlay: click-through on, fit, show, then start the background watchers.
pub fn start(app: &AppHandle) -> Result<(), String> {
    let w = window(app).ok_or_else(|| format!("window {LABEL:?} is missing from tauri.conf.json"))?;

    // Alt+F4 or a system close must not end the app; quitting is the tray's job.
    let handle = app.clone();
    w.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            hide(&handle);
        }
    });

    if NO_ACTIVATE {
        if let Err(e) = platform::apply_no_activate(&w) {
            eprintln!("[overlay] cannot set WS_EX_NOACTIVATE: {e}");
        }
    }
    platform::start_click_through(&w, app.state::<HitRegions>().inner().clone());
    platform::start_work_area_watcher(&w);
    show(app);
    Ok(())
}

// ===========================================================================
// Windows
// ===========================================================================
#[cfg(windows)]
mod platform {
    use std::ffi::c_void;
    use std::time::Duration;

    use tauri::{Emitter, WebviewWindow};
    use windows::Win32::Foundation::{HWND, POINT, RECT};
    use windows::Win32::Graphics::Gdi::ClientToScreen;
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetSystemMetrics, GetWindowLongPtrW, GetWindowRect, IsWindowVisible, SetWindowLongPtrW,
        SetWindowPos, ShowWindow, SystemParametersInfoW, GWL_EXSTYLE, SM_SWAPBUTTON, SPI_GETWORKAREA,
        SWP_ASYNCWINDOWPOS, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SW_SHOWNOACTIVATE,
        SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };

    use super::{HitRegions, CURSOR_EVENT};
    use crate::logic;
    use crate::payload::CursorPayload;

    fn hwnd_of(window: &WebviewWindow) -> Result<HWND, String> {
        let h = window.hwnd().map_err(|e| e.to_string())?;
        Ok(HWND(h.0))
    }

    /// Add WS_EX_NOACTIVATE and WS_EX_TOOLWINDOW to the extended style, keeping everything Tauri set
    /// (TOPMOST, LAYERED, ...), then make Windows re-read the frame without moving, sizing or activating.
    pub fn apply_no_activate(window: &WebviewWindow) -> Result<(), String> {
        let hwnd = hwnd_of(window)?;
        // SAFETY: `hwnd` belongs to our own window; these calls only read/modify its style bits.
        unsafe {
            let old = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let new = old | (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) as isize;
            if new != old {
                // SetWindowLongPtr returns 0 both on failure and when the previous value was 0, so it is not checked.
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new);
            }
            SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
            )
            .map_err(|e| format!("SetWindowPos(FRAMECHANGED) failed: {e}"))
        }
    }

    /// Show the window without activating it (tao's `show()` uses plain `SW_SHOW`, which may activate).
    pub fn show_without_activation(window: &WebviewWindow) -> Result<(), String> {
        let hwnd = hwnd_of(window)?;
        // SAFETY: plain FFI call on our own window. The return value is the previous visibility, not an error.
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
        Ok(())
    }

    /// How often the cursor is sampled (spec: 33 ms).
    const CURSOR_POLL: Duration = Duration::from_millis(33);
    /// How often the work area is re-read (resolution change, taskbar moved or resized).
    const WORK_AREA_POLL: Duration = Duration::from_secs(2);

    /// Work area of the primary monitor in physical pixels.
    fn work_area() -> Result<RECT, String> {
        let mut rect = RECT::default();
        // SAFETY: `rect` outlives the call and is exactly what SPI_GETWORKAREA writes into.
        unsafe {
            SystemParametersInfoW(
                SPI_GETWORKAREA,
                0,
                Some(&mut rect as *mut RECT as *mut c_void),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
            )
        }
        .map_err(|e| format!("SystemParametersInfo(SPI_GETWORKAREA) failed: {e}"))?;
        Ok(rect)
    }

    /// Move/resize the window to the work area with SWP_NOACTIVATE. Only touches the window if it differs.
    /// (The window has no frame and no shadow, so its outer rect equals its client area.)
    pub fn fit(window: &WebviewWindow) -> Result<(), String> {
        let want = work_area()?;
        let (w, h) = (want.right - want.left, want.bottom - want.top);
        if w <= 0 || h <= 0 {
            return Err(format!("work area is empty: {want:?}"));
        }
        let hwnd = hwnd_of(window)?;
        let mut have = RECT::default();
        // SAFETY: `have` outlives the call; `hwnd` is our own window.
        unsafe {
            GetWindowRect(hwnd, &mut have).map_err(|e| format!("GetWindowRect failed: {e}"))?;
            if have.left == want.left && have.top == want.top && have.right == want.right && have.bottom == want.bottom
            {
                return Ok(());
            }
            // ASYNCWINDOWPOS: this runs on helper threads too; do not block on the window's own thread.
            SetWindowPos(
                hwnd,
                None,
                want.left,
                want.top,
                w,
                h,
                SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS,
            )
            .map_err(|e| format!("SetWindowPos failed: {e}"))
        }
    }

    pub fn start_work_area_watcher(window: &WebviewWindow) {
        let window = window.clone();
        let spawned = std::thread::Builder::new()
            .name("kobutai-work-area".into())
            .spawn(move || loop {
                std::thread::sleep(WORK_AREA_POLL);
                if let Err(e) = fit(&window) {
                    eprintln!("[overlay] work-area refresh failed: {e}");
                }
            });
        if let Err(e) = spawned {
            eprintln!("[overlay] cannot start the work-area watcher: {e}");
        }
    }

    /// Is the primary mouse button down? (Honours swapped buttons.)
    fn primary_button_down() -> bool {
        // SAFETY: plain FFI calls without pointers.
        unsafe {
            let vk = if GetSystemMetrics(SM_SWAPBUTTON) != 0 {
                VK_RBUTTON
            } else {
                VK_LBUTTON
            };
            (GetAsyncKeyState(vk.0 as i32) as u16) & 0x8000 != 0
        }
    }

    /// Cursor, client-area origin (both physical screen pixels) and scale factor.
    type Sample = ((i32, i32), (i32, i32), f64);

    fn sample(hwnd: HWND) -> Option<Sample> {
        // SAFETY: `hwnd` is a window handle; the out-pointers are valid locals.
        unsafe {
            if !IsWindowVisible(hwnd).as_bool() {
                return None;
            }
            let mut cursor = POINT::default();
            GetCursorPos(&mut cursor).ok()?;
            let mut origin = POINT { x: 0, y: 0 };
            if !ClientToScreen(hwnd, &mut origin).as_bool() {
                return None;
            }
            let dpi = GetDpiForWindow(hwnd);
            let scale = if dpi == 0 { 1.0 } else { dpi as f64 / 96.0 };
            Some(((cursor.x, cursor.y), (origin.x, origin.y), scale))
        }
    }

    fn emit_cursor(window: &WebviewWindow, inside: bool) {
        if let Err(e) = window.emit_to(super::LABEL, CURSOR_EVENT, CursorPayload { inside }) {
            eprintln!("[overlay] emit {CURSOR_EVENT} failed: {e}");
        }
    }

    pub fn start_click_through(window: &WebviewWindow, regions: HitRegions) {
        // Keep the handle as an integer: a raw HWND pointer is not Send.
        let hwnd = match hwnd_of(window) {
            Ok(h) => h.0 as isize,
            Err(e) => {
                eprintln!("[overlay] no window handle, click-through disabled: {e}");
                return;
            }
        };
        let window = window.clone();
        // Start click-through; the poller opens it up over the interactive rectangles.
        if let Err(e) = window.set_ignore_cursor_events(true) {
            eprintln!("[overlay] set_ignore_cursor_events failed: {e}");
        }
        let spawned = std::thread::Builder::new()
            .name("kobutai-hit-test".into())
            .spawn(move || {
                let hwnd = HWND(hwnd as *mut c_void);
                let mut ignoring = true;
                // Initial state: click-through, i.e. the cursor is not over an interactive region.
                emit_cursor(&window, false);
                loop {
                    std::thread::sleep(CURSOR_POLL);
                    let Some((cursor, origin, scale)) = sample(hwnd) else {
                        continue;
                    };
                    let inside = logic::cursor_in_rects(cursor, origin, scale, &regions.lock());
                    let want = logic::next_ignore_state(ignoring, inside, primary_button_down());
                    if want != ignoring && window.set_ignore_cursor_events(want).is_ok() {
                        ignoring = want;
                        // `inside` = the window now receives the mouse (click-through is off).
                        emit_cursor(&window, !ignoring);
                    }
                }
            });
        if let Err(e) = spawned {
            eprintln!("[overlay] cannot start the cursor poller: {e}");
        }
    }
}

// ===========================================================================
// Non-Windows stub: no work-area fitting, no click-through (the window stays interactive).
// ===========================================================================
#[cfg(not(windows))]
mod platform {
    use tauri::WebviewWindow;

    use super::HitRegions;

    pub fn fit(_window: &WebviewWindow) -> Result<(), String> {
        Ok(())
    }

    pub fn start_work_area_watcher(_window: &WebviewWindow) {}

    pub fn apply_no_activate(_window: &WebviewWindow) -> Result<(), String> {
        Ok(())
    }

    pub fn show_without_activation(window: &WebviewWindow) -> Result<(), String> {
        window.show().map_err(|e| e.to_string())
    }

    pub fn start_click_through(_window: &WebviewWindow, _regions: HitRegions) {}
}

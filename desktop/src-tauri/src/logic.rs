//! Pure, dependency-free logic shared by the Windows and stub code paths.
//!
//! Nothing in here touches Tauri, serde or the Windows API, so the unit tests
//! can run on any OS, even without the Tauri system libraries:
//!
//!     rustc --edition 2021 --test src/logic.rs -o /tmp/logic_tests && /tmp/logic_tests

/// WinRT `TimeSpan` / `DateTime` unit: 100 nanoseconds.
pub const TICKS_PER_SECOND: i64 = 10_000_000;
/// Ticks between 1601-01-01 (the WinRT `DateTime` / FILETIME epoch) and 1970-01-01.
pub const UNIX_EPOCH_AS_TICKS: i64 = 116_444_736_000_000_000;

// ---------------------------------------------------------------------------
// Media sessions
// ---------------------------------------------------------------------------

/// What the system reports for one media session, in raw WinRT units.
#[derive(Clone, Debug, PartialEq)]
pub struct RawSession {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album_title: String,
    pub playing: bool,
    /// `TimelineProperties.Position` in ticks.
    pub position_ticks: i64,
    /// `TimelineProperties.StartTime` in ticks.
    pub start_ticks: i64,
    /// `TimelineProperties.EndTime` in ticks.
    pub end_ticks: i64,
    /// `TimelineProperties.LastUpdatedTime` as a WinRT `DateTime` (ticks since 1601); 0 = unknown.
    pub last_updated_ticks: i64,
    /// `PlaybackInfo.PlaybackRate`; 1.0 when the app does not report one.
    pub playback_rate: f64,
    pub can_play: bool,
    pub can_pause: bool,
    pub can_next: bool,
    pub can_prev: bool,
    pub can_seek: bool,
}

/// One session as sent to the front end (seconds, extrapolated position).
#[derive(Clone, Debug, PartialEq)]
pub struct SessionView {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album_title: String,
    pub playing: bool,
    pub position: f64,
    pub duration: f64,
    pub can_play: bool,
    pub can_pause: bool,
    pub can_next: bool,
    pub can_prev: bool,
    pub can_seek: bool,
}

/// Convert a Unix timestamp to WinRT `DateTime` ticks.
pub fn unix_to_ticks(secs: u64, subsec_nanos: u32) -> i64 {
    let secs = secs.min(i64::MAX as u64 / TICKS_PER_SECOND as u64 / 2) as i64;
    UNIX_EPOCH_AS_TICKS + secs * TICKS_PER_SECOND + (subsec_nanos / 100) as i64
}

/// Ticks to seconds, never negative or NaN.
pub fn ticks_to_seconds(ticks: i64) -> f64 {
    if ticks <= 0 {
        0.0
    } else {
        ticks as f64 / TICKS_PER_SECOND as f64
    }
}

/// Seconds to ticks for `TryChangePlaybackPositionAsync` (seconds x 10_000_000).
/// Returns `None` for NaN, infinite or negative input.
pub fn seconds_to_ticks(seconds: f64) -> Option<i64> {
    if !seconds.is_finite() || seconds < 0.0 {
        return None;
    }
    let ticks = seconds * TICKS_PER_SECOND as f64;
    if ticks >= i64::MAX as f64 {
        return None;
    }
    Some(ticks.round() as i64)
}

/// Position (seconds) at `now_ticks`, given the position reported at `last_updated_ticks`.
///
/// While playing, the elapsed wall-clock time since the app last updated its
/// timeline is added (scaled by the playback rate). The result is clamped to
/// `duration` when the duration is known. A missing or future `last_updated`
/// adds nothing.
pub fn extrapolate_position(
    position_s: f64,
    last_updated_ticks: i64,
    now_ticks: i64,
    rate: f64,
    playing: bool,
    duration_s: f64,
) -> f64 {
    let mut p = if position_s.is_finite() && position_s > 0.0 {
        position_s
    } else {
        0.0
    };
    if playing && last_updated_ticks > 0 && now_ticks > last_updated_ticks {
        let elapsed = (now_ticks - last_updated_ticks) as f64 / TICKS_PER_SECOND as f64;
        let rate = if rate.is_finite() && rate > 0.0 { rate } else { 1.0 };
        p += elapsed * rate;
    }
    if duration_s.is_finite() && duration_s > 0.0 && p > duration_s {
        p = duration_s;
    }
    p
}

/// Build the session list for the payload. Sessions that repeat an id are
/// dropped (the first one wins) so ids stay unique for `media_command`.
pub fn build_sessions(raws: &[RawSession], now_ticks: i64) -> Vec<SessionView> {
    let mut out: Vec<SessionView> = Vec::with_capacity(raws.len());
    for r in raws {
        if out.iter().any(|v| v.id == r.id) {
            continue;
        }
        let duration = ticks_to_seconds(r.end_ticks.saturating_sub(r.start_ticks));
        let reported = ticks_to_seconds(r.position_ticks.saturating_sub(r.start_ticks));
        let position = extrapolate_position(
            reported,
            r.last_updated_ticks,
            now_ticks,
            r.playback_rate,
            r.playing,
            duration,
        );
        out.push(SessionView {
            id: r.id.clone(),
            title: r.title.clone(),
            artist: r.artist.clone(),
            album_title: r.album_title.clone(),
            playing: r.playing,
            position,
            duration,
            can_play: r.can_play,
            can_pause: r.can_pause,
            can_next: r.can_next,
            can_prev: r.can_prev,
            can_seek: r.can_seek,
        });
    }
    out
}

/// The system's current session id, but only if that session is in the list.
pub fn resolve_current(sessions: &[SessionView], current: Option<&str>) -> Option<String> {
    let cur = current?;
    sessions.iter().find(|s| s.id == cur).map(|s| s.id.clone())
}

// ---------------------------------------------------------------------------
// Click-through hit testing
// ---------------------------------------------------------------------------

/// Interactive rectangle in logical (CSS) pixels, relative to the window.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Scale factors that are not finite or not positive fall back to 1.0.
fn sane_scale(scale: f64) -> f64 {
    if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    }
}

/// Screen-space physical cursor position to window-relative logical pixels.
/// `origin` is the physical screen position of the window's client area.
pub fn window_relative_logical(cursor: (i32, i32), origin: (i32, i32), scale: f64) -> (f64, f64) {
    let s = sane_scale(scale);
    (
        (cursor.0 as f64 - origin.0 as f64) / s,
        (cursor.1 as f64 - origin.1 as f64) / s,
    )
}

/// Half-open containment: `x <= px < x + w`, `y <= py < y + h`.
/// Rects with non-finite values or non-positive size never match.
pub fn point_in_rects(p: (f64, f64), rects: &[Rect]) -> bool {
    rects.iter().any(|r| {
        r.x.is_finite()
            && r.y.is_finite()
            && r.w.is_finite()
            && r.h.is_finite()
            && r.w > 0.0
            && r.h > 0.0
            && p.0 >= r.x
            && p.0 < r.x + r.w
            && p.1 >= r.y
            && p.1 < r.y + r.h
    })
}

/// Is the physical screen cursor inside any of the logical rects?
pub fn cursor_in_rects(cursor: (i32, i32), origin: (i32, i32), scale: f64, rects: &[Rect]) -> bool {
    point_in_rects(window_relative_logical(cursor, origin, scale), rects)
}

/// New "ignore cursor events" state. While the left button is held the
/// current state is kept, so a drag that leaves the rect is not interrupted.
pub fn next_ignore_state(current_ignore: bool, cursor_inside: bool, left_button_down: bool) -> bool {
    if left_button_down {
        current_ignore
    } else {
        !cursor_inside
    }
}

// ---------------------------------------------------------------------------
// Tray labels
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Labels {
    pub show_hide: &'static str,
    pub autostart: &'static str,
    pub quit: &'static str,
}

const LABELS_ZH: Labels = Labels {
    show_hide: "显示/隐藏角色",
    autostart: "开机启动",
    quit: "退出",
};
const LABELS_JA: Labels = Labels {
    show_hide: "キャラクターを表示/隠す",
    autostart: "ログイン時に起動",
    quit: "終了",
};
const LABELS_EN: Labels = Labels {
    show_hide: "Show/Hide character",
    autostart: "Start at login",
    quit: "Quit",
};

/// Tray labels for a BCP-47 / POSIX style locale tag ("zh-CN", "ja_JP", "en-US").
/// Chinese and Japanese get their own text; anything else (or none) is English.
pub fn labels_for_locale(locale: Option<&str>) -> Labels {
    let lang = locale
        .unwrap_or("")
        .trim()
        .split(['-', '_', '.', '@'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    match lang.as_str() {
        "zh" => LABELS_ZH,
        "ja" => LABELS_JA,
        _ => LABELS_EN,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const S: i64 = TICKS_PER_SECOND;

    fn raw(id: &str) -> RawSession {
        RawSession {
            id: id.to_string(),
            title: "T".into(),
            artist: "A".into(),
            album_title: "B".into(),
            playing: true,
            position_ticks: 10 * S,
            start_ticks: 0,
            end_ticks: 200 * S,
            last_updated_ticks: 1_000 * S,
            playback_rate: 1.0,
            can_play: true,
            can_pause: true,
            can_next: true,
            can_prev: false,
            can_seek: true,
        }
    }

    // --- extrapolation -----------------------------------------------------

    #[test]
    fn extrapolates_while_playing() {
        let p = extrapolate_position(10.0, 1_000 * S, 1_003 * S, 1.0, true, 200.0);
        assert!((p - 13.0).abs() < 1e-9);
    }

    #[test]
    fn does_not_extrapolate_when_paused() {
        let p = extrapolate_position(10.0, 1_000 * S, 1_050 * S, 1.0, false, 200.0);
        assert_eq!(p, 10.0);
    }

    #[test]
    fn respects_playback_rate() {
        let p = extrapolate_position(10.0, 1_000 * S, 1_004 * S, 1.5, true, 200.0);
        assert!((p - 16.0).abs() < 1e-9);
        // nonsense rates fall back to 1.0
        assert!((extrapolate_position(0.0, 1, 1 + 2 * S, 0.0, true, 0.0) - 2.0).abs() < 1e-9);
        assert!((extrapolate_position(0.0, 1, 1 + 2 * S, f64::NAN, true, 0.0) - 2.0).abs() < 1e-9);
        assert!((extrapolate_position(0.0, 1, 1 + 2 * S, -3.0, true, 0.0) - 2.0).abs() < 1e-9);
    }

    #[test]
    fn clamps_to_duration() {
        let p = extrapolate_position(190.0, 1_000 * S, 1_100 * S, 1.0, true, 200.0);
        assert_eq!(p, 200.0);
    }

    #[test]
    fn unknown_duration_is_not_clamped() {
        let p = extrapolate_position(190.0, 1_000 * S, 1_100 * S, 1.0, true, 0.0);
        assert!((p - 290.0).abs() < 1e-9);
    }

    #[test]
    fn missing_or_future_last_updated_adds_nothing() {
        assert_eq!(extrapolate_position(10.0, 0, 1_000 * S, 1.0, true, 200.0), 10.0);
        assert_eq!(extrapolate_position(10.0, 2_000 * S, 1_000 * S, 1.0, true, 200.0), 10.0);
    }

    #[test]
    fn bad_position_is_zero() {
        assert_eq!(extrapolate_position(f64::NAN, 0, 0, 1.0, false, 0.0), 0.0);
        assert_eq!(extrapolate_position(-5.0, 0, 0, 1.0, false, 0.0), 0.0);
        assert_eq!(extrapolate_position(f64::INFINITY, 0, 0, 1.0, false, 0.0), 0.0);
    }

    // --- tick conversion ---------------------------------------------------

    #[test]
    fn tick_conversions() {
        assert_eq!(ticks_to_seconds(25_000_000), 2.5);
        assert_eq!(ticks_to_seconds(-5), 0.0);
        assert_eq!(seconds_to_ticks(1.0), Some(10_000_000));
        assert_eq!(seconds_to_ticks(12.5), Some(125_000_000));
        assert_eq!(seconds_to_ticks(0.0), Some(0));
        assert_eq!(seconds_to_ticks(-1.0), None);
        assert_eq!(seconds_to_ticks(f64::NAN), None);
        assert_eq!(seconds_to_ticks(f64::INFINITY), None);
        assert_eq!(seconds_to_ticks(1e30), None);
    }

    #[test]
    fn unix_epoch_maps_to_filetime_epoch_offset() {
        assert_eq!(unix_to_ticks(0, 0), 116_444_736_000_000_000);
        assert_eq!(unix_to_ticks(1, 500_000_000), 116_444_736_000_000_000 + 15_000_000);
        // 2026-10-14T00:00:00Z
        assert_eq!(
            unix_to_ticks(1_791_936_000, 0),
            116_444_736_000_000_000 + 1_791_936_000 * S
        );
    }

    // --- payload building --------------------------------------------------

    #[test]
    fn builds_a_view_with_extrapolated_position() {
        let v = build_sessions(&[raw("Spotify.exe")], 1_005 * S);
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].id, "Spotify.exe");
        assert!(v[0].playing);
        assert!((v[0].position - 15.0).abs() < 1e-9);
        assert_eq!(v[0].duration, 200.0);
        assert!(v[0].can_play && v[0].can_pause && v[0].can_next && !v[0].can_prev && v[0].can_seek);
    }

    #[test]
    fn position_is_relative_to_start_time() {
        let mut r = raw("live");
        r.start_ticks = 100 * S;
        r.position_ticks = 130 * S;
        r.end_ticks = 400 * S;
        r.playing = false;
        let v = build_sessions(&[r], 0);
        assert_eq!(v[0].position, 30.0);
        assert_eq!(v[0].duration, 300.0);
    }

    #[test]
    fn unknown_duration_is_zero() {
        let mut r = raw("x");
        r.end_ticks = 0;
        r.start_ticks = 0;
        let v = build_sessions(&[r], 1_001 * S);
        assert_eq!(v[0].duration, 0.0);
        assert!(v[0].position > 10.0);
    }

    #[test]
    fn end_before_start_gives_zero_duration() {
        let mut r = raw("x");
        r.start_ticks = 50 * S;
        r.end_ticks = 10 * S;
        assert_eq!(build_sessions(&[r], 0)[0].duration, 0.0);
    }

    #[test]
    fn duplicate_ids_keep_the_first() {
        let mut a = raw("Chrome");
        a.title = "first".into();
        let mut b = raw("Chrome");
        b.title = "second".into();
        let v = build_sessions(&[a, raw("Spotify.exe"), b], 0);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].title, "first");
        assert_eq!(v[1].id, "Spotify.exe");
    }

    #[test]
    fn current_id_must_be_in_the_list() {
        let v = build_sessions(&[raw("a"), raw("b")], 0);
        assert_eq!(resolve_current(&v, Some("b")), Some("b".to_string()));
        assert_eq!(resolve_current(&v, Some("zzz")), None);
        assert_eq!(resolve_current(&v, None), None);
        assert_eq!(resolve_current(&[], Some("a")), None);
    }

    // --- hit testing -------------------------------------------------------

    fn r(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect { x, y, w, h }
    }

    #[test]
    fn logical_conversion_uses_origin_and_scale() {
        // 150% scale, window at (0, 40) in physical pixels
        let p = window_relative_logical((300, 190), (0, 40), 1.5);
        assert!((p.0 - 200.0).abs() < 1e-9);
        assert!((p.1 - 100.0).abs() < 1e-9);
        // negative origin (secondary monitor to the left)
        let p = window_relative_logical((-1000, 10), (-1920, 0), 1.0);
        assert_eq!(p, (920.0, 10.0));
    }

    #[test]
    fn invalid_scale_falls_back_to_one() {
        assert_eq!(window_relative_logical((10, 10), (0, 0), 0.0), (10.0, 10.0));
        assert_eq!(window_relative_logical((10, 10), (0, 0), f64::NAN), (10.0, 10.0));
        assert_eq!(window_relative_logical((10, 10), (0, 0), -2.0), (10.0, 10.0));
    }

    #[test]
    fn cursor_inside_and_outside_with_scaling() {
        let rects = [r(100.0, 100.0, 50.0, 50.0)];
        // 200% scale: logical (100..150) is physical (200..300)
        assert!(cursor_in_rects((200, 200), (0, 0), 2.0, &rects));
        assert!(cursor_in_rects((299, 299), (0, 0), 2.0, &rects));
        assert!(!cursor_in_rects((300, 300), (0, 0), 2.0, &rects));
        assert!(!cursor_in_rects((199, 250), (0, 0), 2.0, &rects));
        // the same physical point at 100% scale is outside
        assert!(!cursor_in_rects((200, 200), (0, 0), 1.0, &rects));
    }

    #[test]
    fn window_origin_offsets_the_test() {
        let rects = [r(0.0, 0.0, 10.0, 10.0)];
        assert!(cursor_in_rects((1920, 40), (1920, 40), 1.0, &rects));
        assert!(!cursor_in_rects((1919, 40), (1920, 40), 1.0, &rects));
    }

    #[test]
    fn multiple_rects_and_empty_list() {
        let rects = [r(0.0, 0.0, 10.0, 10.0), r(100.0, 100.0, 10.0, 10.0)];
        assert!(point_in_rects((105.0, 105.0), &rects));
        assert!(point_in_rects((5.0, 5.0), &rects));
        assert!(!point_in_rects((50.0, 50.0), &rects));
        assert!(!point_in_rects((5.0, 5.0), &[]));
    }

    #[test]
    fn degenerate_rects_never_match() {
        assert!(!point_in_rects((5.0, 5.0), &[r(0.0, 0.0, 0.0, 10.0)]));
        assert!(!point_in_rects((5.0, 5.0), &[r(0.0, 0.0, -10.0, 10.0)]));
        assert!(!point_in_rects((5.0, 5.0), &[r(f64::NAN, 0.0, 10.0, 10.0)]));
        assert!(!point_in_rects((5.0, 5.0), &[r(0.0, 0.0, f64::INFINITY, 10.0)]));
    }

    #[test]
    fn button_held_keeps_the_current_state() {
        // not dragging: follow the cursor
        assert!(!next_ignore_state(true, true, false)); // entered -> capture
        assert!(next_ignore_state(false, false, false)); // left -> pass through
                                                         // dragging: no change either way
        assert!(!next_ignore_state(false, false, true));
        assert!(next_ignore_state(true, true, true));
    }

    // --- tray labels -------------------------------------------------------

    #[test]
    fn labels_follow_the_language() {
        assert_eq!(labels_for_locale(Some("zh-CN")).quit, "退出");
        assert_eq!(labels_for_locale(Some("zh-Hans-CN")).show_hide, "显示/隐藏角色");
        assert_eq!(labels_for_locale(Some("zh_TW")).autostart, "开机启动");
        assert_eq!(labels_for_locale(Some("ja-JP")).show_hide, "キャラクターを表示/隠す");
        assert_eq!(labels_for_locale(Some("ja")).autostart, "ログイン時に起動");
        assert_eq!(labels_for_locale(Some("JA_jp")).quit, "終了");
        assert_eq!(labels_for_locale(Some("en-US")).quit, "Quit");
        assert_eq!(labels_for_locale(Some("en-US")).show_hide, "Show/Hide character");
        assert_eq!(labels_for_locale(Some("en-US")).autostart, "Start at login");
        assert_eq!(labels_for_locale(Some("fr-FR")), labels_for_locale(Some("en")));
        assert_eq!(labels_for_locale(Some("")), labels_for_locale(Some("en")));
        assert_eq!(labels_for_locale(None).quit, "Quit");
        assert_eq!(labels_for_locale(Some("zh@x")).quit, "退出");
    }
}

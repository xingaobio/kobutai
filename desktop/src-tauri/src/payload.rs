//! Wire types for the Rust <-> front-end contract (docs/development/DESKTOP.md section 4).
//! JSON field names are camelCase. Only depends on serde, so it also compiles on every OS.

use serde::{Deserialize, Serialize};

use crate::logic::{Rect, SessionView};

/// Event `media://sessions` payload and the return value of `media_sessions`.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionsPayload {
    pub sessions: Vec<DesktopSession>,
    pub current_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSession {
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

impl From<SessionView> for DesktopSession {
    fn from(v: SessionView) -> Self {
        DesktopSession {
            id: v.id,
            title: v.title,
            artist: v.artist,
            album_title: v.album_title,
            playing: v.playing,
            position: v.position,
            duration: v.duration,
            can_play: v.can_play,
            can_pause: v.can_pause,
            can_next: v.can_next,
            can_prev: v.can_prev,
            can_seek: v.can_seek,
        }
    }
}

/// Event `overlay://cursor` payload: `inside` is true while click-through is off (cursor over a hit region).
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct CursorPayload {
    pub inside: bool,
}

/// Argument `cmd` of `media_command`: `{ "type": "play" }` ... `{ "type": "seek", "time": 12.5 }`.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum DesktopCommand {
    Play,
    Pause,
    Toggle,
    Next,
    Prev,
    Seek { time: f64 },
}

/// Element of the `rects` argument of `set_hit_regions` (logical CSS pixels).
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl From<HitRect> for Rect {
    fn from(r: HitRect) -> Self {
        Rect {
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn payload_serialises_with_camel_case_fields() {
        let p = SessionsPayload {
            sessions: vec![DesktopSession {
                id: "Spotify.exe".into(),
                title: "t".into(),
                artist: "a".into(),
                album_title: "b".into(),
                playing: true,
                position: 1.5,
                duration: 200.0,
                can_play: true,
                can_pause: true,
                can_next: true,
                can_prev: false,
                can_seek: true,
            }],
            current_id: Some("Spotify.exe".into()),
        };
        let v = serde_json::to_value(&p).unwrap();
        assert_eq!(
            v,
            json!({
                "sessions": [{
                    "id": "Spotify.exe", "title": "t", "artist": "a", "albumTitle": "b",
                    "playing": true, "position": 1.5, "duration": 200.0,
                    "canPlay": true, "canPause": true, "canNext": true, "canPrev": false, "canSeek": true
                }],
                "currentId": "Spotify.exe"
            })
        );
    }

    #[test]
    fn empty_payload_has_null_current_id() {
        let v = serde_json::to_value(SessionsPayload::default()).unwrap();
        assert_eq!(v, json!({ "sessions": [], "currentId": null }));
    }

    #[test]
    fn commands_deserialise_from_the_contract_shape() {
        let c: DesktopCommand = serde_json::from_value(json!({ "type": "play" })).unwrap();
        assert_eq!(c, DesktopCommand::Play);
        for (name, want) in [
            ("pause", DesktopCommand::Pause),
            ("toggle", DesktopCommand::Toggle),
            ("next", DesktopCommand::Next),
            ("prev", DesktopCommand::Prev),
        ] {
            let c: DesktopCommand = serde_json::from_value(json!({ "type": name })).unwrap();
            assert_eq!(c, want);
        }
        let c: DesktopCommand = serde_json::from_value(json!({ "type": "seek", "time": 12.5 })).unwrap();
        assert_eq!(c, DesktopCommand::Seek { time: 12.5 });
        assert!(serde_json::from_value::<DesktopCommand>(json!({ "type": "seek" })).is_err());
        assert!(serde_json::from_value::<DesktopCommand>(json!({ "type": "volume" })).is_err());
    }

    #[test]
    fn cursor_payload_shape() {
        assert_eq!(
            serde_json::to_value(CursorPayload { inside: true }).unwrap(),
            json!({ "inside": true })
        );
        assert_eq!(
            serde_json::to_value(CursorPayload { inside: false }).unwrap(),
            json!({ "inside": false })
        );
    }

    #[test]
    fn hit_rects_deserialise() {
        let r: Vec<HitRect> = serde_json::from_value(json!([{ "x": 1, "y": 2.5, "w": 30, "h": 40 }])).unwrap();
        assert_eq!(
            r[0],
            HitRect {
                x: 1.0,
                y: 2.5,
                w: 30.0,
                h: 40.0
            }
        );
        assert_eq!(Rect::from(r[0]).h, 40.0);
    }
}

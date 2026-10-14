//! System media sessions (Windows GSMTC) -> `media://sessions` events and the
//! `media_sessions` / `media_command` commands. Contract: docs/development/DESKTOP.md section 4.1, 4.2.
//!
//! Threading: one dedicated worker thread (WinRT MTA) owns the session manager
//! and every session object. WinRT event handlers only push small messages into
//! the worker's channel, so they never block. Slow calls (`TryGetMediaPropertiesAsync`,
//! `Try*Async`) run on short-lived helper threads and report back through the same
//! channel, so one misbehaving app cannot stall the others.

use tauri::{AppHandle, Manager, State};

use crate::payload::{DesktopCommand, SessionsPayload};

/// Event name carrying a `SessionsPayload`.
#[cfg_attr(not(windows), allow(dead_code))]
pub const EVENT: &str = "media://sessions";

pub use imp::MediaService;

/// Create the media service and register it as Tauri state.
pub fn start(app: &AppHandle) {
    app.manage(MediaService::start(app.clone()));
}

/// Current sessions. The front end calls this once at start-up; afterwards it listens to `media://sessions`.
#[tauri::command]
pub async fn media_sessions(service: State<'_, MediaService>) -> Result<SessionsPayload, String> {
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.snapshot())
        .await
        .map_err(|e| format!("media task failed: {e}"))?
}

/// Control one session: play, pause, toggle, next, prev, seek (seconds).
#[tauri::command]
pub async fn media_command(service: State<'_, MediaService>, id: String, cmd: DesktopCommand) -> Result<(), String> {
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.command(id, cmd))
        .await
        .map_err(|e| format!("media task failed: {e}"))?
}

// ===========================================================================
// Windows implementation
// ===========================================================================
#[cfg(windows)]
mod imp {
    use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    use tauri::{AppHandle, Emitter};
    use windows::core::{IUnknown, Interface};
    use windows::Foundation::TypedEventHandler;
    use windows::Media::Control::{
        CurrentSessionChangedEventArgs, GlobalSystemMediaTransportControlsSession,
        GlobalSystemMediaTransportControlsSessionManager, GlobalSystemMediaTransportControlsSessionPlaybackStatus,
        MediaPropertiesChangedEventArgs, PlaybackInfoChangedEventArgs, SessionsChangedEventArgs,
        TimelinePropertiesChangedEventArgs,
    };
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    use super::EVENT;
    use crate::logic::{self, RawSession};
    use crate::payload::{DesktopCommand, DesktopSession, SessionsPayload};

    type Manager = GlobalSystemMediaTransportControlsSessionManager;
    type Session = GlobalSystemMediaTransportControlsSession;

    /// Coalesce bursts of WinRT events into one emission.
    const DEBOUNCE: Duration = Duration::from_millis(100);
    /// While anything is playing, emit this often so the position keeps moving.
    const TICK: Duration = Duration::from_secs(1);
    /// A new session waits this long for its title/artist before it is reported without them.
    const PROPS_GRACE: Duration = Duration::from_secs(2);
    /// Re-try fetching media properties if a fetch has not returned after this long.
    const FETCH_TIMEOUT: Duration = Duration::from_secs(10);
    /// Retry interval when the session manager cannot be created.
    const CONNECT_RETRY: Duration = Duration::from_secs(5);
    /// How long a command waits for the system to answer.
    const COMMAND_TIMEOUT: Duration = Duration::from_secs(10);

    /// Join the multithreaded apartment. Fresh threads have no apartment, and WinRT activation fails without one.
    fn init_mta() {
        // SAFETY: plain FFI call; an error (e.g. already initialised) is irrelevant here.
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
    }

    fn now_ticks() -> i64 {
        let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
        logic::unix_to_ticks(d.as_secs(), d.subsec_nanos())
    }

    /// Same underlying WinRT object? (COM identity: compare the `IUnknown` pointers.)
    fn same_object(a: &Session, b: &Session) -> bool {
        match (a.cast::<IUnknown>(), b.cast::<IUnknown>()) {
            (Ok(a), Ok(b)) => a.as_raw() == b.as_raw(),
            _ => false,
        }
    }

    #[derive(Clone, Default)]
    struct Props {
        title: String,
        artist: String,
        album_title: String,
    }

    enum Msg {
        /// The set of sessions changed (or the system's current session did): re-scan.
        SessionsChanged,
        /// Playback state or timeline of some session changed: re-emit.
        Dirty,
        /// Title/artist of a session changed: re-fetch them.
        PropsChanged(String),
        PropsFetched {
            id: String,
            result: Result<Props, String>,
        },
        Snapshot(Sender<SessionsPayload>),
        Command {
            id: String,
            cmd: DesktopCommand,
            reply: Sender<Result<(), String>>,
        },
    }

    #[derive(Clone)]
    pub struct MediaService {
        tx: Sender<Msg>,
    }

    impl MediaService {
        pub fn start(app: AppHandle) -> Self {
            let (tx, rx) = mpsc::channel();
            let worker_tx = tx.clone();
            let spawned = std::thread::Builder::new().name("kobutai-media".into()).spawn(move || {
                init_mta();
                Worker::new(app, worker_tx).run(rx);
            });
            if let Err(e) = spawned {
                eprintln!("[media] could not start the worker thread: {e}");
            }
            MediaService { tx }
        }

        /// Blocking; call from `spawn_blocking`.
        pub fn snapshot(&self) -> Result<SessionsPayload, String> {
            let (rtx, rrx) = mpsc::channel();
            self.tx
                .send(Msg::Snapshot(rtx))
                .map_err(|_| "media service is not running".to_string())?;
            rrx.recv_timeout(COMMAND_TIMEOUT)
                .map_err(|_| "media service did not answer".to_string())
        }

        /// Blocking; call from `spawn_blocking`.
        pub fn command(&self, id: String, cmd: DesktopCommand) -> Result<(), String> {
            let (rtx, rrx) = mpsc::channel();
            self.tx
                .send(Msg::Command { id, cmd, reply: rtx })
                .map_err(|_| "media service is not running".to_string())?;
            rrx.recv_timeout(COMMAND_TIMEOUT)
                .map_err(|_| "media service did not answer".to_string())?
        }
    }

    struct Entry {
        id: String,
        session: Session,
        /// MediaPropertiesChanged, PlaybackInfoChanged, TimelinePropertiesChanged
        tokens: [i64; 3],
        props: Option<Props>,
        props_stale: bool,
        fetch_started: Option<Instant>,
        first_seen: Instant,
    }

    impl Entry {
        fn unsubscribe(&self) {
            // Errors are expected when the session is already gone.
            let _ = self.session.RemoveMediaPropertiesChanged(self.tokens[0]);
            let _ = self.session.RemovePlaybackInfoChanged(self.tokens[1]);
            let _ = self.session.RemoveTimelinePropertiesChanged(self.tokens[2]);
        }

        fn pending(&self, now: Instant) -> bool {
            self.props.is_none() && now.duration_since(self.first_seen) < PROPS_GRACE
        }
    }

    struct Worker {
        app: AppHandle,
        tx: Sender<Msg>,
        manager: Option<Manager>,
        manager_tokens: Option<(i64, i64)>,
        retry_connect_at: Option<Instant>,
        entries: Vec<Entry>,
        need_reconcile: bool,
        dirty_at: Option<Instant>,
        next_tick: Option<Instant>,
        /// Wake-up for the end of the oldest new session's `PROPS_GRACE`.
        grace_at: Option<Instant>,
    }

    impl Worker {
        fn new(app: AppHandle, tx: Sender<Msg>) -> Self {
            Worker {
                app,
                tx,
                manager: None,
                manager_tokens: None,
                retry_connect_at: Some(Instant::now()),
                entries: Vec::new(),
                need_reconcile: false,
                dirty_at: None,
                next_tick: None,
                grace_at: None,
            }
        }

        fn run(mut self, rx: Receiver<Msg>) {
            loop {
                let now = Instant::now();
                let deadline = [self.dirty_at, self.next_tick, self.retry_connect_at, self.grace_at]
                    .into_iter()
                    .flatten()
                    .min();
                let received = match deadline {
                    Some(d) => rx.recv_timeout(d.saturating_duration_since(now)),
                    None => rx.recv().map_err(|_| RecvTimeoutError::Disconnected),
                };
                match received {
                    Ok(msg) => self.handle(msg),
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => break,
                }

                let now = Instant::now();
                if self.retry_connect_at.is_some_and(|t| now >= t) {
                    self.try_connect();
                }
                let due = self.dirty_at.is_some_and(|t| now >= t)
                    || self.next_tick.is_some_and(|t| now >= t)
                    || self.grace_at.is_some_and(|t| now >= t);
                if due {
                    self.emit();
                }
            }
        }

        fn arm_dirty(&mut self) {
            if self.dirty_at.is_none() {
                self.dirty_at = Some(Instant::now() + DEBOUNCE);
            }
        }

        fn handle(&mut self, msg: Msg) {
            match msg {
                Msg::SessionsChanged => {
                    self.need_reconcile = true;
                    self.arm_dirty();
                }
                Msg::Dirty => self.arm_dirty(),
                Msg::PropsChanged(id) => {
                    if let Some(e) = self.entries.iter_mut().find(|e| e.id == id) {
                        e.props_stale = true;
                    }
                    self.arm_dirty();
                }
                Msg::PropsFetched { id, result } => {
                    if let Some(e) = self.entries.iter_mut().find(|e| e.id == id) {
                        e.fetch_started = None;
                        match result {
                            Ok(p) => e.props = Some(p),
                            Err(err) => {
                                eprintln!("[media] reading properties of {id} failed: {err}");
                                // Report the session without text rather than waiting forever.
                                e.props.get_or_insert_with(Props::default);
                            }
                        }
                    }
                    self.arm_dirty();
                }
                Msg::Snapshot(reply) => {
                    self.prepare();
                    let _ = reply.send(self.build_payload());
                }
                Msg::Command { id, cmd, reply } => self.run_command(id, cmd, reply),
            }
        }

        // ---- manager / sessions -------------------------------------------------

        fn try_connect(&mut self) {
            self.retry_connect_at = None;
            match self.connect() {
                Ok(()) => {
                    self.need_reconcile = true;
                    self.arm_dirty();
                }
                Err(e) => {
                    eprintln!("[media] session manager unavailable ({e}); retrying");
                    self.retry_connect_at = Some(Instant::now() + CONNECT_RETRY);
                }
            }
        }

        fn connect(&mut self) -> windows::core::Result<()> {
            let manager = Manager::RequestAsync()?.get()?;
            let tx = self.tx.clone();
            let t1 = manager.SessionsChanged(&TypedEventHandler::<Manager, SessionsChangedEventArgs>::new(
                move |_, _| {
                    let _ = tx.send(Msg::SessionsChanged);
                    Ok(())
                },
            ))?;
            let tx = self.tx.clone();
            let t2 = manager.CurrentSessionChanged(&TypedEventHandler::<Manager, CurrentSessionChangedEventArgs>::new(
                move |_, _| {
                    let _ = tx.send(Msg::Dirty);
                    Ok(())
                },
            ));
            let t2 = match t2 {
                Ok(t) => t,
                Err(e) => {
                    let _ = manager.RemoveSessionsChanged(t1);
                    return Err(e);
                }
            };
            self.manager_tokens = Some((t1, t2));
            self.manager = Some(manager);
            Ok(())
        }

        /// Do any pending work needed before reading state (re-scan sessions, start property fetches).
        fn prepare(&mut self) {
            if self.need_reconcile {
                self.need_reconcile = false;
                self.reconcile();
            }
            self.kick_fetches();
        }

        fn subscribe(&self, id: &str, s: &Session) -> windows::core::Result<[i64; 3]> {
            let tx = self.tx.clone();
            let key = id.to_string();
            let t1 = s.MediaPropertiesChanged(&TypedEventHandler::<Session, MediaPropertiesChangedEventArgs>::new(
                move |_, _| {
                    let _ = tx.send(Msg::PropsChanged(key.clone()));
                    Ok(())
                },
            ))?;
            let tx = self.tx.clone();
            let t2 = s.PlaybackInfoChanged(&TypedEventHandler::<Session, PlaybackInfoChangedEventArgs>::new(
                move |_, _| {
                    let _ = tx.send(Msg::Dirty);
                    Ok(())
                },
            ));
            let t2 = match t2 {
                Ok(t) => t,
                Err(e) => {
                    let _ = s.RemoveMediaPropertiesChanged(t1);
                    return Err(e);
                }
            };
            let tx = self.tx.clone();
            let t3 = s.TimelinePropertiesChanged(
                &TypedEventHandler::<Session, TimelinePropertiesChangedEventArgs>::new(move |_, _| {
                    let _ = tx.send(Msg::Dirty);
                    Ok(())
                }),
            );
            match t3 {
                Ok(t3) => Ok([t1, t2, t3]),
                Err(e) => {
                    let _ = s.RemoveMediaPropertiesChanged(t1);
                    let _ = s.RemovePlaybackInfoChanged(t2);
                    Err(e)
                }
            }
        }

        /// Bring `entries` in line with the system's session list (keeping the system's order).
        fn reconcile(&mut self) {
            let Some(manager) = self.manager.clone() else { return };
            let list = match manager.GetSessions() {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("[media] GetSessions failed: {e}");
                    return;
                }
            };
            let mut old: Vec<Entry> = std::mem::take(&mut self.entries);
            let mut next: Vec<Entry> = Vec::new();
            for session in list {
                let id = match session.SourceAppUserModelId() {
                    Ok(h) => h.to_string(),
                    Err(_) => continue,
                };
                if id.is_empty() || next.iter().any(|e| e.id == id) {
                    continue; // unnamed or duplicate id: the first session with an id wins
                }
                let reuse = old.iter().position(|e| e.id == id);
                let mut previous_props = None;
                if let Some(i) = reuse {
                    let e = old.remove(i);
                    if same_object(&e.session, &session) {
                        next.push(e);
                        continue;
                    }
                    // The app restarted under the same id: re-subscribe, keep the text until the re-fetch lands.
                    e.unsubscribe();
                    previous_props = e.props.clone();
                }
                match self.subscribe(&id, &session) {
                    Ok(tokens) => {
                        let first_seen = Instant::now();
                        if previous_props.is_none() {
                            let t = first_seen + PROPS_GRACE;
                            self.grace_at = Some(self.grace_at.map_or(t, |g| g.min(t)));
                        }
                        next.push(Entry {
                            id,
                            session,
                            tokens,
                            props_stale: previous_props.is_some(),
                            props: previous_props,
                            fetch_started: None,
                            first_seen,
                        });
                    }
                    Err(e) => eprintln!("[media] cannot subscribe to {id}: {e}"),
                }
            }
            for gone in old {
                gone.unsubscribe();
            }
            self.entries = next;
        }

        /// Start a property fetch for every session that has none yet or whose text changed.
        fn kick_fetches(&mut self) {
            let now = Instant::now();
            for e in self.entries.iter_mut() {
                if !(e.props.is_none() || e.props_stale) {
                    continue;
                }
                if e.fetch_started.is_some_and(|t| now.duration_since(t) < FETCH_TIMEOUT) {
                    continue;
                }
                e.props_stale = false;
                e.fetch_started = Some(now);
                let session = e.session.clone();
                let tx = self.tx.clone();
                let id = e.id.clone();
                let spawned = std::thread::Builder::new().name("kobutai-media-props".into()).spawn({
                    let id = id.clone();
                    move || {
                        init_mta();
                        let result = (|| -> windows::core::Result<Props> {
                            let p = session.TryGetMediaPropertiesAsync()?.get()?;
                            Ok(Props {
                                title: p.Title()?.to_string(),
                                artist: p.Artist()?.to_string(),
                                album_title: p.AlbumTitle()?.to_string(),
                            })
                        })()
                        .map_err(|e| e.to_string());
                        let _ = tx.send(Msg::PropsFetched { id, result });
                    }
                });
                if let Err(err) = spawned {
                    eprintln!("[media] cannot start a property fetch for {id}: {err}");
                    e.fetch_started = None;
                    e.props.get_or_insert_with(Props::default);
                }
            }
        }

        // ---- payload ------------------------------------------------------------

        fn read_raw(e: &Entry) -> Option<RawSession> {
            let info = e.session.GetPlaybackInfo().ok()?;
            let playing =
                info.PlaybackStatus().ok()? == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;
            let controls = info.Controls().ok()?;
            let rate = info.PlaybackRate().ok().and_then(|r| r.Value().ok()).unwrap_or(1.0);

            let (mut position, mut start, mut end, mut updated) = (0i64, 0i64, 0i64, 0i64);
            if let Ok(t) = e.session.GetTimelineProperties() {
                position = t.Position().map(|d| d.Duration).unwrap_or(0);
                start = t.StartTime().map(|d| d.Duration).unwrap_or(0);
                end = t.EndTime().map(|d| d.Duration).unwrap_or(0);
                updated = t.LastUpdatedTime().map(|d| d.UniversalTime).unwrap_or(0);
            }
            let props = e.props.clone().unwrap_or_default();
            Some(RawSession {
                id: e.id.clone(),
                title: props.title,
                artist: props.artist,
                album_title: props.album_title,
                playing,
                position_ticks: position,
                start_ticks: start,
                end_ticks: end,
                last_updated_ticks: updated,
                playback_rate: rate,
                can_play: controls.IsPlayEnabled().unwrap_or(false),
                can_pause: controls.IsPauseEnabled().unwrap_or(false),
                can_next: controls.IsNextEnabled().unwrap_or(false),
                can_prev: controls.IsPreviousEnabled().unwrap_or(false),
                can_seek: controls.IsPlaybackPositionEnabled().unwrap_or(false),
            })
        }

        fn build_payload(&self) -> SessionsPayload {
            let now = Instant::now();
            let raws: Vec<RawSession> = self
                .entries
                .iter()
                .filter(|e| !e.pending(now))
                .filter_map(Self::read_raw)
                .collect();
            let sessions = logic::build_sessions(&raws, now_ticks());
            let current = self
                .manager
                .as_ref()
                .and_then(|m| m.GetCurrentSession().ok())
                .and_then(|s| s.SourceAppUserModelId().ok())
                .map(|h| h.to_string());
            let current_id = logic::resolve_current(&sessions, current.as_deref());
            SessionsPayload {
                sessions: sessions.into_iter().map(DesktopSession::from).collect(),
                current_id,
            }
        }

        fn emit(&mut self) {
            self.dirty_at = None;
            self.prepare();
            let now = Instant::now();
            self.grace_at = self
                .entries
                .iter()
                .filter(|e| e.pending(now))
                .map(|e| e.first_seen + PROPS_GRACE)
                .min();
            let payload = self.build_payload();
            if let Err(e) = self.app.emit(EVENT, &payload) {
                eprintln!("[media] emit failed: {e}");
            }
            self.next_tick = if payload.sessions.iter().any(|s| s.playing) {
                Some(Instant::now() + TICK)
            } else {
                None
            };
        }

        // ---- commands -----------------------------------------------------------

        fn run_command(&mut self, id: String, cmd: DesktopCommand, reply: Sender<Result<(), String>>) {
            let Some(session) = self.entries.iter().find(|e| e.id == id).map(|e| e.session.clone()) else {
                let _ = reply.send(Err(format!("no media session with id {id:?}")));
                return;
            };
            let thread_reply = reply.clone();
            let spawned = std::thread::Builder::new()
                .name("kobutai-media-cmd".into())
                .spawn(move || {
                    init_mta();
                    let _ = thread_reply.send(exec(&session, cmd));
                });
            if let Err(e) = spawned {
                let _ = reply.send(Err(format!("cannot start the command thread: {e}")));
            }
        }
    }

    impl Drop for Worker {
        fn drop(&mut self) {
            for e in &self.entries {
                e.unsubscribe();
            }
            if let (Some(m), Some((t1, t2))) = (&self.manager, self.manager_tokens) {
                let _ = m.RemoveSessionsChanged(t1);
                let _ = m.RemoveCurrentSessionChanged(t2);
            }
        }
    }

    /// Run one command against a session and wait for the system's answer.
    fn exec(session: &Session, cmd: DesktopCommand) -> Result<(), String> {
        let op = match cmd {
            DesktopCommand::Play => session.TryPlayAsync(),
            DesktopCommand::Pause => session.TryPauseAsync(),
            DesktopCommand::Toggle => session.TryTogglePlayPauseAsync(),
            DesktopCommand::Next => session.TrySkipNextAsync(),
            DesktopCommand::Prev => session.TrySkipPreviousAsync(),
            DesktopCommand::Seek { time } => {
                let ticks = logic::seconds_to_ticks(time).ok_or_else(|| format!("invalid seek time: {time}"))?;
                // Position is reported relative to StartTime, so add it back (0 for almost every app).
                let start = session
                    .GetTimelineProperties()
                    .and_then(|t| t.StartTime())
                    .map(|d| d.Duration.max(0))
                    .unwrap_or(0);
                session.TryChangePlaybackPositionAsync(ticks.saturating_add(start))
            }
        };
        let accepted = op.map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
        if accepted {
            Ok(())
        } else {
            Err("the app did not accept the command".to_string())
        }
    }
}

// ===========================================================================
// Non-Windows stub: no sessions, commands fail. Keeps the crate compiling.
// ===========================================================================
#[cfg(not(windows))]
mod imp {
    use tauri::AppHandle;

    use crate::payload::{DesktopCommand, SessionsPayload};

    #[derive(Clone)]
    pub struct MediaService;

    impl MediaService {
        pub fn start(_app: AppHandle) -> Self {
            MediaService
        }

        pub fn snapshot(&self) -> Result<SessionsPayload, String> {
            Ok(SessionsPayload::default())
        }

        pub fn command(&self, _id: String, _cmd: DesktopCommand) -> Result<(), String> {
            Err("system media sessions are only available on Windows".to_string())
        }
    }
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Current position of a snapshot received at `at`, extrapolated while playing. */
export function livePosition(s: { playing: boolean; currentTime: number; duration: number }, at: number, now: number): number {
  const t = s.playing ? s.currentTime + (now - at) / 1000 : s.currentTime;
  return s.duration > 0 ? Math.min(s.duration, t) : t;
}

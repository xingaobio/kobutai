export interface MediaSnapshot {
  playing: boolean;
  /** Seconds. */
  currentTime: number;
  /** Seconds; 0 when unknown (live streams report Infinity → 0). */
  duration: number;
  /** 0..1 */
  volume: number;
  muted: boolean;
  /** The player's volume can be changed from here. Absent means true; the desktop app's system sessions say false. */
  canVolume?: boolean;
  title: string;
  artist: string;
  artwork?: string;
  canNext: boolean;
  canPrev: boolean;
  canSeek: boolean;
  /** Adapter id that produced the snapshot, e.g. "youtube" or "generic". */
  adapter: string;
  /** Page hostname. */
  site: string;
  /** The player reports an endless duration: a live stream. */
  live?: boolean;
}

export type MediaCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'seek'; time: number }
  | { type: 'volume'; volume: number }
  | { type: 'mute'; muted: boolean };

/** Controls the media of one frame. Site adapters implement this for players with custom UIs. */
export interface MediaController {
  readonly id: string;
  /** Null when this frame has nothing controllable. */
  snapshot(): MediaSnapshot | null;
  run(cmd: MediaCommand): void;
}

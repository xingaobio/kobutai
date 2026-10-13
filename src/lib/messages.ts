import type { MediaCommand, MediaSnapshot } from './media/types';
import type { DrawView } from './gacha/engine';
import type { RegistryState } from './registry';

export const PORT_NAME = 'happydesk';
/** Extension pages (the toolbar popup) that show the state and send commands but report no media. */
export const VIEW_PORT_NAME = 'kobutai-view';

/** Content script (any frame) → background. */
export type ToBackground =
  | { t: 'snapshot'; snap: MediaSnapshot | null }
  /** Command for a registry entry; `key` omitted = primary. */
  | { t: 'command'; key?: string; cmd: MediaCommand }
  | { t: 'select'; key: string }
  /** Gacha: redraw once for the current content. */
  | { t: 'reroll' }
  /** Gacha: pin (or unpin) the current character. */
  | { t: 'lock'; locked: boolean };

/** Background → content script. */
export type ToContent =
  | { t: 'command'; cmd: MediaCommand }
  /** Only sent to top frames, which host the overlay. */
  | { t: 'state'; state: RegistryState; draw: DrawView | null };

/** One-off runtime messages (popup ↔ content). */
export type RuntimeRequest = { t: 'site-info' } | { t: 'set-site-hidden'; hidden: boolean };

/** Content → background: resolve an `hdblob:` asset to a data URL. */
export type BlobRequest = { t: 'get-blob'; key: string };
export type SiteInfo = { host: string; hidden: boolean };

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { CursorIo, CursorPayload } from './cursor';
import type { SessionsIo, SessionsPayload } from './sessions';

/** The real thing behind the `SessionsIo` interface (tests inject a fake instead). */
export const tauriIo: SessionsIo = {
  listen: (event, cb) => listen<SessionsPayload>(event, (e) => cb(e.payload)),
  invoke: (cmd, args) => invoke(cmd, args),
};

export const tauriCursorIo: CursorIo = {
  listen: (event, cb) => listen<CursorPayload>(event, (e) => cb(e.payload)),
};

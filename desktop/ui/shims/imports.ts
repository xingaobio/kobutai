/**
 * Stands in for WXT's `#imports` virtual module (aliased in desktop/vite.config.ts).
 * Only what the shared code in src/ imports from it is provided.
 */
export { storage } from './storage';
export { desktopBrowser as browser } from './browser';

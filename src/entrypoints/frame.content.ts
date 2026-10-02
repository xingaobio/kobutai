import { startFrameReporter } from '@/lib/media/frame';

/** Subframes only report media (e.g. embedded players); the overlay lives in the top frame. Kept free of UI code. */
export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main(ctx) {
    if (window.top === window) return;
    startFrameReporter(ctx);
  },
});

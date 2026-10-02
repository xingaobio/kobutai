import { installHook } from '@/lib/media/hook';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    installHook(window);
  },
});

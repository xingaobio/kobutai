import { adapterFor } from './adapters';
import { PageMediaController } from './controller';
import { MediaReporter, type ClientPort } from './reporter';
import { PORT_NAME, type ToContent } from '../messages';

/** Start reporting this frame's media to the background. Shared by the top-frame overlay and the subframe reporter. */
export function startFrameReporter(
  ctx: { onInvalidated(cb: () => void): unknown },
  onMessage: (msg: ToContent) => void = () => {},
): MediaReporter {
  const controller = new PageMediaController(document, location, adapterFor(location.hostname));
  const reporter = new MediaReporter(
    controller,
    () => browser.runtime.connect({ name: PORT_NAME }) as unknown as ClientPort,
    document,
    onMessage,
  );
  reporter.start();
  ctx.onInvalidated(() => {
    reporter.dispose();
    controller.dispose();
  });
  return reporter;
}

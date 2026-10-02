import { Hub } from '@/lib/hub';
import { PORT_NAME } from '@/lib/messages';

export default defineBackground(() => {
  const hub = new Hub();
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === PORT_NAME) hub.connect(port);
  });
});

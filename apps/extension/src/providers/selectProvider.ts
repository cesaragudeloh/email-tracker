import type {
  ComposeDetected,
  EmailProviderAdapter,
} from './EmailProviderAdapter.js';
import { GmailAdapter } from './gmail/GmailAdapter.js';
import { OutlookAdapter } from './outlook/OutlookAdapter.js';

export function selectProvider(
  location: Pick<Location, 'hostname' | 'protocol'>,
  document: Document,
  onComposeDetected: ComposeDetected,
): EmailProviderAdapter | undefined {
  const gmail = new GmailAdapter(document, onComposeDetected);
  if (gmail.canHandle(location)) return gmail;
  const outlook = new OutlookAdapter(document, onComposeDetected);
  return outlook.canHandle(location) ? outlook : undefined;
}

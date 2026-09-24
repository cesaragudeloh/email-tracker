import type {
  ComposeDetected,
  EmailProviderAdapter,
} from './EmailProviderAdapter.js';
import { GmailAdapter } from './gmail/GmailAdapter.js';

export function selectProvider(
  location: Pick<Location, 'hostname' | 'protocol'>,
  document: Document,
  onComposeDetected: ComposeDetected,
): EmailProviderAdapter | undefined {
  const gmail = new GmailAdapter(document, onComposeDetected);
  return gmail.canHandle(location) ? gmail : undefined;
}

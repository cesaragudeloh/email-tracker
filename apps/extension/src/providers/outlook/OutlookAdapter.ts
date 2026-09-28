import type {
  ComposeDetected,
  EmailProviderAdapter,
} from '../EmailProviderAdapter.js';
import { ComposeSendController } from '../shared/ComposeSendController.js';
import { ComposeTrackingControls } from '../shared/ComposeTrackingControls.js';
import {
  findOutlookCompose,
  outlookDom,
  outlookObservedAttributes,
  outlookSelectors,
} from './outlookSelectors.js';
import { isOutlookLocation } from '../providerHosts.js';

export class OutlookAdapter implements EmailProviderAdapter {
  private observer?: MutationObserver;
  private readonly detected = new WeakSet<HTMLElement>();
  private readonly controls = new ComposeTrackingControls(outlookDom);
  private readonly send: ComposeSendController;

  constructor(
    private readonly document: Document,
    private readonly onComposeDetected: ComposeDetected,
  ) {
    this.send = new ComposeSendController(document, this.controls, outlookDom);
  }

  canHandle(location: Pick<Location, 'hostname' | 'protocol'>): boolean {
    return isOutlookLocation(location);
  }

  start(): void {
    if (this.observer) return;
    this.send.start();
    this.observer = new MutationObserver(() => this.scan());
    this.observer.observe(this.document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: outlookObservedAttributes,
    });
    this.scan();
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.send.stop();
  }

  private scan(): void {
    for (const editor of this.document.querySelectorAll<HTMLElement>(
      outlookSelectors.editor,
    )) {
      if (!this.observer) return;
      const compose =
        editor.closest<HTMLElement>(outlookSelectors.compose) ??
        findOutlookCompose(editor);
      if (!compose?.isConnected) continue;
      compose.setAttribute('data-email-tracker-outlook-compose', '');
      this.controls.ensureAttached(compose);
      if (this.detected.has(compose)) continue;
      this.detected.add(compose);
      try {
        this.onComposeDetected(compose);
      } catch {
        /* Keep native mail usable. */
      }
    }
  }
}

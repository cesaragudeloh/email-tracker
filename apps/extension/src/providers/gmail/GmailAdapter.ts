import type {
  ComposeDetected,
  EmailProviderAdapter,
} from '../EmailProviderAdapter.js';
import {
  gmailObservedAttributes,
  gmailSelectors,
  isGmailCompose,
} from './gmailSelectors.js';
import { GmailTrackingControls } from './GmailTrackingControls.js';

export class GmailAdapter implements EmailProviderAdapter {
  private observer?: MutationObserver;
  private readonly detected = new WeakSet<HTMLElement>();
  private readonly trackingControls = new GmailTrackingControls();

  constructor(
    private readonly document: Document,
    private readonly onComposeDetected: ComposeDetected,
  ) {}

  canHandle(location: Pick<Location, 'hostname' | 'protocol'>): boolean {
    return (
      location.protocol === 'https:' && location.hostname === 'mail.google.com'
    );
  }

  start(): void {
    if (this.observer) return;
    this.observer = new MutationObserver((records) => {
      const candidates = new Set<HTMLElement>();
      for (const record of records) {
        if (record.target instanceof Element) {
          this.addContainer(record.target, candidates);
        }
        if (record.type === 'attributes' && record.target instanceof Element) {
          this.collect(record.target, candidates);
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element) this.collect(node, candidates);
        }
      }
      this.notify(candidates);
    });
    this.observer.observe(this.document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: gmailObservedAttributes,
    });
    const candidates = new Set<HTMLElement>();
    if (this.document.documentElement) {
      this.collect(this.document.documentElement, candidates);
    }
    this.notify(candidates);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  private addContainer(node: Element, candidates: Set<HTMLElement>): void {
    const dialog = node.closest(gmailSelectors.dialog);
    if (dialog instanceof HTMLElement) candidates.add(dialog);
  }

  private collect(node: Element, candidates: Set<HTMLElement>): void {
    this.addContainer(node, candidates);
    node
      .querySelectorAll<HTMLElement>(gmailSelectors.dialog)
      .forEach((dialog) => {
        candidates.add(dialog);
      });
  }

  private notify(candidates: Set<HTMLElement>): void {
    for (const dialog of candidates) {
      if (!this.observer) return;
      if (
        !dialog.isConnected ||
        (!this.detected.has(dialog) && !isGmailCompose(dialog))
      )
        continue;
      this.trackingControls.ensureAttached(dialog);
      if (this.detected.has(dialog)) continue;
      this.detected.add(dialog);
      try {
        this.onComposeDetected(dialog);
      } catch {
        // Un consumidor defectuoso no debe interrumpir Gmail ni el observer.
      }
    }
  }
}

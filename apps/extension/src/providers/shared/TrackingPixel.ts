import type { CreateTrackingResponse } from '@email-tracker/shared';
import type { ComposeDom } from './composeDom.js';

export function validateTrackingUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.pathname.startsWith('/o/') &&
      url.pathname.length > 3 &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export class TrackingPixel {
  constructor(private readonly dom: ComposeDom) {}
  private pixels(dialog: HTMLElement): HTMLImageElement[] {
    return Array.from(
      dialog.querySelectorAll<HTMLImageElement>('img[data-email-tracker-id]'),
    ).filter((pixel) => this.dom.findCompose(pixel) === dialog);
  }

  remove(dialog: HTMLElement): boolean {
    try {
      this.pixels(dialog).forEach((pixel) => pixel.remove());
      return this.pixels(dialog).length === 0;
    } catch {
      return false;
    }
  }

  insert(dialog: HTMLElement, tracking: CreateTrackingResponse): boolean {
    try {
      const body = this.dom.findBody(dialog);
      if (!body || !validateTrackingUrl(tracking.trackingUrl)) {
        this.remove(dialog);
        return false;
      }
      const existing = this.pixels(dialog);
      const pixel =
        existing.find(
          (node) =>
            node.dataset.emailTrackerId === tracking.trackingId &&
            node.getAttribute('src') === tracking.trackingUrl &&
            node.parentElement === body,
        ) ?? dialog.ownerDocument.createElement('img');
      for (const node of existing) if (node !== pixel) node.remove();
      pixel.setAttribute('src', tracking.trackingUrl);
      pixel.width = 1;
      pixel.height = 1;
      pixel.alt = '';
      pixel.setAttribute('aria-hidden', 'true');
      pixel.dataset.emailTrackerId = tracking.trackingId;
      pixel.style.cssText = 'width: 1px; height: 1px; border: 0; opacity: 0;';
      if (body.lastChild !== pixel) body.appendChild(pixel);
      const inserted =
        pixel.parentElement === body &&
        body.lastChild === pixel &&
        this.pixels(dialog).length === 1;
      if (!inserted) this.remove(dialog);
      return inserted;
    } catch {
      this.remove(dialog);
      return false;
    }
  }
}

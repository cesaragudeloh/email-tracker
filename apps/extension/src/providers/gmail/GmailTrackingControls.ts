import {
  createTrackingToggle,
  trackingToggleSelector,
  type TrackingToggle,
} from '../../ui/TrackingToggle.js';
import { findGmailTogglePlacement, gmailSelectors } from './gmailSelectors.js';

export class GmailTrackingControls {
  // El valor solo contiene el control y su estado. No hay listas de compose
  // ni listeners globales que mantengan vivas ventanas retiradas por Gmail.
  private readonly controls = new WeakMap<HTMLElement, TrackingToggle>();

  ensureAttached(dialog: HTMLElement): void {
    const known = this.controls.get(dialog);
    if (known && dialog.contains(known.element)) return;
    const existing = Array.from(
      dialog.querySelectorAll<HTMLElement>(trackingToggleSelector),
    ).find((element) => element.closest(gmailSelectors.dialog) === dialog);
    if (existing) return;
    const placement = findGmailTogglePlacement(dialog);
    if (!placement) return;
    const control = known ?? createTrackingToggle(dialog.ownerDocument);
    this.controls.set(dialog, control);
    // Reutilizar el mismo control conserva el estado si Gmail reconstruye acciones.
    placement.parent.insertBefore(
      control.element,
      placement.after?.nextSibling ?? null,
    );
  }
}

import {
  createTrackingToggle,
  trackingToggleSelector,
  type TrackingToggle,
} from '../../ui/TrackingToggle.js';
import { findGmailTogglePlacement, gmailSelectors } from './gmailSelectors.js';

// Shared across adapter instances: the existing checkbox remains the only ON/OFF source.
const controls = new WeakMap<HTMLElement, TrackingToggle>();

export class GmailTrackingControls {
  // El valor solo contiene el control y su estado. No hay listas de compose
  // ni listeners globales que mantengan vivas ventanas retiradas por Gmail.
  isEnabled(dialog: HTMLElement): boolean {
    return controls.get(dialog)?.enabled ?? false;
  }

  ensureAttached(dialog: HTMLElement): void {
    const known = controls.get(dialog);
    if (known && dialog.contains(known.element)) return;
    const existing = Array.from(
      dialog.querySelectorAll<HTMLElement>(trackingToggleSelector),
    ).find((element) => element.closest(gmailSelectors.dialog) === dialog);
    if (existing) return;
    const placement = findGmailTogglePlacement(dialog);
    if (!placement) return;
    const control = known ?? createTrackingToggle(dialog.ownerDocument);
    controls.set(dialog, control);
    // Reutilizar el mismo control conserva el estado si Gmail reconstruye acciones.
    placement.parent.insertBefore(
      control.element,
      placement.after?.nextSibling ?? null,
    );
  }
}

import {
  createTrackingToggle,
  trackingToggleSelector,
  type TrackingToggle,
} from '../../ui/TrackingToggle.js';
import type { ComposeDom } from './composeDom.js';

// Shared across adapter instances: the existing checkbox remains the only ON/OFF source.
const controls = new WeakMap<HTMLElement, TrackingToggle>();

export class ComposeTrackingControls {
  constructor(private readonly dom: ComposeDom) {}
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
    ).find((element) => this.dom.findCompose(element) === dialog);
    if (existing) return;
    const placement = this.dom.findTogglePlacement(dialog);
    if (!placement) return;
    const control = known ?? createTrackingToggle(dialog.ownerDocument);
    controls.set(dialog, control);
    // Reutilizar el mismo control conserva el estado si el proveedor reconstruye acciones.
    placement.parent.insertBefore(
      control.element,
      placement.after?.nextSibling ?? null,
    );
  }
}

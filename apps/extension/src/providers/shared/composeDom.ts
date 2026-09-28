import type { CreateTrackingRequest } from '@email-tracker/shared';

export interface TrackingControls {
  isEnabled(compose: HTMLElement): boolean;
}

export interface ComposeDom {
  findCompose(node: Element): HTMLElement | null;
  findBody(compose: HTMLElement): HTMLElement | undefined;
  findSend(compose: HTMLElement): HTMLElement | undefined;
  readMetadata(compose: HTMLElement): CreateTrackingRequest | undefined;
  findTogglePlacement(
    compose: HTMLElement,
  ): { parent: HTMLElement; after: Element | null } | undefined;
  isSendShortcut(key: KeyboardEvent, send: HTMLElement): boolean;
}

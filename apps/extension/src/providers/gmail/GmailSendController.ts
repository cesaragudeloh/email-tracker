import type {
  CreateTrackingRequest,
  CreateTrackingResponse,
} from '@email-tracker/shared';
import {
  requestTracking,
  type CreateTracking,
} from '../../api/trackingMessages.js';
import { GmailTrackingControls } from './GmailTrackingControls.js';
import {
  findGmailSendButton,
  gmailSelectors,
  readGmailMetadata,
} from './gmailSelectors.js';

interface ComposeSendState {
  isCreatingTracking: boolean;
  isResumingSend: boolean;
  attempted?: CreateTrackingRequest;
  tracking?: CreateTrackingResponse;
}
// Shared to survive duplicate adapters; keys do not keep closed drafts alive.
const contexts = new WeakMap<HTMLElement, ComposeSendState>();
const warning = 'Email Tracker: tracking unavailable, sending without tracking';
const sameMetadata = (
  a: CreateTrackingRequest | undefined,
  b: CreateTrackingRequest | undefined,
) => !!a && !!b && a.recipient === b.recipient && a.subject === b.subject;

export class GmailSendController {
  private started = false;
  constructor(
    private readonly document: Document,
    private readonly controls: GmailTrackingControls,
    private readonly create: CreateTracking = requestTracking,
    private readonly warn: () => void = () => console.warn(warning),
    private readonly created: () => void = () =>
      console.info('Email Tracker: tracking created'),
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    // Window capture precedes target/document handlers, including delegated clicks.
    this.document.defaultView?.addEventListener('click', this.onSend, true);
    this.document.defaultView?.addEventListener('keydown', this.onSend, true);
  }

  stop(): void {
    this.started = false;
    this.document.defaultView?.removeEventListener('click', this.onSend, true);
    this.document.defaultView?.removeEventListener(
      'keydown',
      this.onSend,
      true,
    );
  }

  getTracking(
    dialog: HTMLElement,
  ): Readonly<CreateTrackingResponse> | undefined {
    return contexts.get(dialog)?.tracking;
  }

  private readonly onSend = (event: Event): void => {
    if (!(event.target instanceof Element)) return;
    const dialog = event.target.closest<HTMLElement>(gmailSelectors.dialog);
    if (!dialog?.isConnected) return;
    const send = findGmailSendButton(dialog);
    if (!send || send.matches(gmailSelectors.disabled)) return;
    const onButton = send.contains(event.target);
    if (event.type === 'keydown') {
      const key = event as KeyboardEvent;
      if (key.isComposing || key.altKey || key.shiftKey) return;
      const shortcut = key.key === 'Enter' && (key.ctrlKey || key.metaKey);
      if (!shortcut && !(onButton && (key.key === 'Enter' || key.key === ' ')))
        return;
    } else if (!onButton || (event as MouseEvent).button !== 0) return;

    let state = contexts.get(dialog);
    if (state?.isResumingSend) return;
    if (state?.isCreatingTracking) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!this.controls.isEnabled(dialog)) return;
    const request = readGmailMetadata(dialog);
    if (!request || !event.cancelable) {
      if (state) {
        state.tracking = undefined;
        state.attempted = undefined;
      }
      this.warn();
      return;
    }
    // Gmail may keep a compose after validation, cancellation or an Undo Send.
    // Reuse the same attempt; changed metadata starts a new attempt.
    if (sameMetadata(state?.attempted, request)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state ??= { isCreatingTracking: false, isResumingSend: false };
    contexts.set(dialog, state);
    state.isCreatingTracking = true;
    state.attempted = request;
    state.tracking = undefined;
    void this.prepareAndResume(dialog, state, request);
  };

  private async prepareAndResume(
    dialog: HTMLElement,
    state: ComposeSendState,
    request: CreateTrackingRequest,
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Covers a stalled worker/message/storage as well as the client's HTTP timeout.
      const tracking = await Promise.race([
        Promise.resolve().then(() => this.create(request)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Tracking timeout')),
            20000,
          );
        }),
      ]);
      if (
        dialog.isConnected &&
        this.controls.isEnabled(dialog) &&
        sameMetadata(request, readGmailMetadata(dialog))
      ) {
        state.tracking = tracking;
        this.created();
      } else if (dialog.isConnected) this.warn();
    } catch {
      this.warn();
    } finally {
      clearTimeout(timer);
      state.isCreatingTracking = false;
      // Changes made while waiting must never associate stale metadata with Send.
      state.attempted = readGmailMetadata(dialog);
      if (dialog.isConnected) this.resume(dialog, state);
    }
  }

  private resume(dialog: HTMLElement, state: ComposeSendState): void {
    const send = findGmailSendButton(dialog);
    if (!send || send.matches(gmailSelectors.disabled)) {
      this.warn();
      return;
    }
    state.isResumingSend = true;
    try {
      send.click();
    } catch {
      this.warn();
    } finally {
      state.isResumingSend = false;
    }
  }
}

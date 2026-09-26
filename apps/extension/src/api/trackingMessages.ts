import { z } from 'zod';
import {
  HISTORY_LIMIT,
  localTrackingRecordSchema,
  type LocalTrackingRecord,
} from '../tracking/historyStorage.js';
import {
  getTrackingResponseSchema,
  type GetTrackingResponse,
  createTrackingRequestSchema,
  createTrackingResponseSchema,
  type CreateTrackingRequest,
  type CreateTrackingResponse,
} from '@email-tracker/shared';

const messageSchema = z
  .object({
    type: z.literal('email-tracker:create-tracking'),
    request: createTrackingRequestSchema,
  })
  .strict();
const replySchema = z.discriminatedUnion('ok', [
  z
    .object({ ok: z.literal(true), tracking: createTrackingResponseSchema })
    .strict(),
  z.object({ ok: z.literal(false) }).strict(),
]);
export type CreateTracking = (
  request: CreateTrackingRequest,
) => Promise<CreateTrackingResponse>;

// Content scripts never read authorization storage or receive the JWT.
export async function requestTracking(
  request: CreateTrackingRequest,
): Promise<CreateTrackingResponse> {
  const reply = replySchema.parse(
    await chrome.runtime.sendMessage({
      type: 'email-tracker:create-tracking',
      request: createTrackingRequestSchema.parse(request),
    }),
  );
  if (!reply.ok) throw new Error('Tracking unavailable');
  return reply.tracking;
}

export function createTrackingMessageListener(
  create: CreateTracking,
  extensionId: string,
) {
  return (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    respond: (reply: unknown) => void,
  ): boolean => {
    const parsed = messageSchema.safeParse(message);
    if (!parsed.success) return false;
    // Only this extension's top-level Gmail content script may use this bridge.
    try {
      if (
        sender.id !== extensionId ||
        sender.tab?.id === undefined ||
        sender.frameId !== 0 ||
        new URL(sender.url ?? '').origin !== 'https://mail.google.com'
      )
        return false;
    } catch {
      return false;
    }
    void Promise.resolve()
      .then(() => create(parsed.data.request))
      .then((tracking) =>
        respond({
          ok: true,
          tracking: createTrackingResponseSchema.parse(tracking),
        }),
      )
      .catch(() => respond({ ok: false }));
    return true;
  };
}

// Only the extension popup may query protected details or local history.
export function isPopupSender(
  sender: chrome.runtime.MessageSender,
  extensionId: string,
): boolean {
  return (
    sender.id === extensionId &&
    sender.tab === undefined &&
    sender.url === `chrome-extension://${extensionId}/popup.html`
  );
}

const queryErrorSchema = z.enum([
  'UNAUTHORIZED',
  'NOT_FOUND',
  'SERVICE_UNAVAILABLE',
]);
export type TrackingQueryErrorCode = z.infer<typeof queryErrorSchema>;
export class TrackingQueryError extends Error {
  constructor(public readonly code: TrackingQueryErrorCode) {
    super(code);
  }
}
const getMessageSchema = z
  .object({
    type: z.literal('email-tracker:get-tracking'),
    trackingId: z.uuid(),
  })
  .strict();
const listMessageSchema = z
  .object({ type: z.literal('email-tracker:list-trackings') })
  .strict();
const queryFailureSchema = z
  .object({ ok: z.literal(false), error: queryErrorSchema })
  .strict();
const getReplySchema = z.discriminatedUnion('ok', [
  z
    .object({ ok: z.literal(true), tracking: getTrackingResponseSchema })
    .strict(),
  queryFailureSchema,
]);
const listReplySchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      records: z.array(localTrackingRecordSchema).max(HISTORY_LIMIT),
    })
    .strict(),
  queryFailureSchema,
]);

export async function requestTrackingDetail(
  trackingId: string,
): Promise<GetTrackingResponse> {
  try {
    const message = getMessageSchema.parse({
      type: 'email-tracker:get-tracking',
      trackingId,
    });
    const reply = getReplySchema.parse(await popupMessage(message));
    if (!reply.ok) throw new TrackingQueryError(reply.error);
    if (reply.tracking.trackingId !== trackingId)
      throw new TrackingQueryError('SERVICE_UNAVAILABLE');
    return reply.tracking;
  } catch (error) {
    throw error instanceof TrackingQueryError
      ? error
      : new TrackingQueryError('SERVICE_UNAVAILABLE');
  }
}
export async function requestTrackingList(): Promise<LocalTrackingRecord[]> {
  try {
    const reply = listReplySchema.parse(
      await popupMessage({ type: 'email-tracker:list-trackings' }),
    );
    if (!reply.ok) throw new TrackingQueryError(reply.error);
    return reply.records;
  } catch (error) {
    throw error instanceof TrackingQueryError
      ? error
      : new TrackingQueryError('SERVICE_UNAVAILABLE');
  }
}

export async function popupMessage(message: unknown): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      chrome.runtime.sendMessage(message),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Message timeout')), 20000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createTrackingQueryListener(
  getTracking: (trackingId: string) => Promise<GetTrackingResponse>,
  list: () => Promise<LocalTrackingRecord[]>,
  isActivated: () => Promise<boolean>,
  extensionId: string,
) {
  return (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    respond: (reply: unknown) => void,
  ): boolean => {
    if (!isPopupSender(sender, extensionId)) return false;
    const get = getMessageSchema.safeParse(message);
    const listing = listMessageSchema.safeParse(message);
    if (!get.success && !listing.success) return false;
    void (async () => {
      if (!(await isActivated())) throw new TrackingQueryError('UNAUTHORIZED');
      if (get.success) {
        const tracking = getTrackingResponseSchema.parse(
          await getTracking(get.data.trackingId),
        );
        if (tracking.trackingId !== get.data.trackingId)
          throw new TrackingQueryError('SERVICE_UNAVAILABLE');
        respond({ ok: true, tracking });
      } else {
        respond(listReplySchema.parse({ ok: true, records: await list() }));
      }
    })().catch((error: unknown) => {
      const code = queryErrorSchema.safeParse(
        error && typeof error === 'object' && 'code' in error
          ? error.code
          : undefined,
      );
      respond({
        ok: false,
        error: code.success ? code.data : 'SERVICE_UNAVAILABLE',
      });
    });
    return true;
  };
}

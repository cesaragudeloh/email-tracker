import { z } from 'zod';
import {
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

import { z } from 'zod';
import { activationErrorSchema } from '@email-tracker/shared';
import { ActivationClientError } from './client.js';
import { isPopupSender, popupMessage } from './trackingMessages.js';
import type { createActivationService } from '../activation/activationService.js';

const stateSchema = z
  .object({ installationId: z.uuid(), activated: z.boolean() })
  .strict();
const requestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('email-tracker:activation-state') }).strict(),
  z
    .object({
      type: z.literal('email-tracker:activate'),
      activationCode: z.string().max(256),
    })
    .strict(),
]);
const replySchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), state: stateSchema }).strict(),
  z.object({ ok: z.literal(false), error: activationErrorSchema }).strict(),
]);
export type ActivationState = z.infer<typeof stateSchema>;
async function request(
  message: z.infer<typeof requestSchema>,
): Promise<ActivationState> {
  try {
    const reply = replySchema.parse(await popupMessage(message));
    if (!reply.ok) throw new ActivationClientError(reply.error);
    return reply.state;
  } catch (error) {
    throw error instanceof ActivationClientError
      ? error
      : new ActivationClientError('SERVICE_UNAVAILABLE');
  }
}
export const activationBridge = {
  getState: () => request({ type: 'email-tracker:activation-state' }),
  activate: (activationCode: string) =>
    request({ type: 'email-tracker:activate', activationCode }),
};
export function createActivationMessageListener(
  service: ReturnType<typeof createActivationService>,
  extensionId: string,
) {
  return (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    respond: (reply: unknown) => void,
  ): boolean => {
    if (!isPopupSender(sender, extensionId)) return false;
    const parsed = requestSchema.safeParse(message);
    if (!parsed.success) return false;
    void Promise.resolve()
      .then(() =>
        parsed.data.type === 'email-tracker:activate'
          ? service.activate(parsed.data.activationCode)
          : service.getState(),
      )
      .then((state) => respond({ ok: true, state: stateSchema.parse(state) }))
      .catch((error: unknown) =>
        respond({
          ok: false,
          error:
            error instanceof ActivationClientError
              ? error.code
              : 'SERVICE_UNAVAILABLE',
        }),
      );
    return true;
  };
}

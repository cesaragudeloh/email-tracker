import { z } from 'zod';

export const createTrackingRequestSchema = z
  .object({
    recipient: z.email().max(254),
    subject: z.string().max(998),
  })
  .strict();

export const trackingStatusSchema = z.enum(['CREATED', 'OPEN_DETECTED']);
export const createTrackingResponseSchema = z
  .object({
    trackingId: z.uuid(),
    trackingUrl: z.url(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export type CreateTrackingRequest = z.infer<typeof createTrackingRequestSchema>;
export type CreateTrackingResponse = z.infer<
  typeof createTrackingResponseSchema
>;
export type TrackingStatus = z.infer<typeof trackingStatusSchema>;

export const trackingOpenEventResponseSchema = z
  .object({
    eventId: z.uuid(),
    openedAt: z.iso.datetime(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
  })
  .strict();

export const getTrackingResponseSchema = createTrackingRequestSchema
  .extend({
    trackingId: z.uuid(),
    status: trackingStatusSchema,
    createdAt: z.iso.datetime(),
    openCount: z.number().int().nonnegative(),
    firstOpenedAt: z.iso.datetime().nullable(),
    lastOpenedAt: z.iso.datetime().nullable(),
    events: z.array(trackingOpenEventResponseSchema),
  })
  .strict();

export type TrackingOpenEventResponse = z.infer<
  typeof trackingOpenEventResponseSchema
>;
export type GetTrackingResponse = z.infer<typeof getTrackingResponseSchema>;

import { z } from 'zod';

export const createTrackingRequestSchema = z
  .object({
    recipient: z.email().max(254),
    subject: z.string().max(998),
  })
  .strict();

export const trackingStatusSchema = z.literal('CREATED');
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

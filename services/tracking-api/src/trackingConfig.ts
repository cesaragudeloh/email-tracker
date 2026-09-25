import { z } from 'zod';

export const DEFAULT_TRACKING_BASE_URL = 'https://tracking.cesaragudelo.com';

export function readTrackingConfig(env: NodeJS.ProcessEnv) {
  return z
    .object({
      TRACKING_TABLE_NAME: z.string().min(1),
      JWT_SECRET_ARN: z.string().min(1),
      TRACKING_BASE_URL: z
        .url()
        .refine((value) => {
          const url = new URL(value);
          return (
            (url.protocol === 'https:' ||
              (url.protocol === 'http:' && url.hostname === 'localhost')) &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash
          );
        })
        .default(DEFAULT_TRACKING_BASE_URL)
        .transform((url) => url.replace(/\/+$/, '')),
    })
    .parse(env);
}

import { z } from 'zod';

export function readConfig(env: NodeJS.ProcessEnv) {
  return z
    .object({
      LICENSE_TABLE_NAME: z.string().min(1),
      JWT_SECRET_ARN: z.string().min(1),
      JWT_TTL_SECONDS: z.coerce.number().int().min(1).max(86400).default(86400),
    })
    .parse(env);
}

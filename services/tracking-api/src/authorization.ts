import { verifyToken } from './token.js';
import { TrackingError, type AuthenticatedIdentity } from './tracking.js';

export function createAuthorization(signingKey: () => Promise<Uint8Array>) {
  return async (header: string | undefined): Promise<AuthenticatedIdentity> => {
    const match = /^Bearer ([^\s,]+)$/i.exec(header ?? '');
    if (!match) throw new TrackingError('UNAUTHORIZED', 401);
    // Infrastructure failures remain 500; only invalid tokens become 401.
    const key = await signingKey();
    try {
      const { licenseId, installationId } = await verifyToken(match[1], key);
      return { licenseId, installationId };
    } catch {
      throw new TrackingError('UNAUTHORIZED', 401);
    }
  };
}

import { SignJWT, jwtVerify } from 'jose';
import {
  TOKEN_AUDIENCE,
  TOKEN_ISSUER,
  tokenClaimsSchema,
  type TokenClaims,
} from '@email-tracker/shared';

export async function signToken(
  claims: TokenClaims,
  key: Uint8Array,
): Promise<string> {
  if (key.byteLength < 32) throw new Error('Signing key is too short');
  return new SignJWT(tokenClaimsSchema.parse(claims))
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .sign(key);
}

// Verificación compartida por los endpoints protegidos.
export async function verifyToken(
  token: string,
  key: Uint8Array,
  now = new Date(),
): Promise<TokenClaims> {
  const { payload } = await jwtVerify(token, key, {
    algorithms: ['HS256'],
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
    requiredClaims: ['iat', 'exp', 'licenseId', 'installationId'],
    currentDate: now,
  });
  return tokenClaimsSchema.parse(payload);
}

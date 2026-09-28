import { LicenseNotFoundError } from './licenseAdminRepository.js';

export class LicenseCliError extends Error {}

// Never echo AWS messages, arbitrary arguments, credentials or stack traces.
export function licenseCliError(error: unknown): LicenseCliError {
  if (error instanceof LicenseCliError) return error;
  if (error instanceof LicenseNotFoundError)
    return new LicenseCliError(error.message);
  const name = error instanceof Error ? error.name : '';
  if (
    [
      'CredentialsProviderError',
      'ExpiredTokenException',
      'UnrecognizedClientException',
      'InvalidSignatureException',
    ].includes(name)
  )
    return new LicenseCliError(
      'AWS authentication failed. Check the default credential chain and session expiration.',
    );
  if (['AccessDeniedException', 'UnauthorizedException'].includes(name))
    return new LicenseCliError(
      'AWS permission denied. Check the administrative IAM permissions for this table.',
    );
  if (name === 'ResourceNotFoundException')
    return new LicenseCliError(
      'Table not found. Check --table, account and region.',
    );
  if (
    ['TimeoutError', 'NetworkingError', 'AbortError'].includes(name) ||
    (error instanceof Error &&
      'code' in error &&
      [
        'ENOTFOUND',
        'EAI_AGAIN',
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
      ].includes(String(error.code)))
  )
    return new LicenseCliError(
      'AWS network request failed. Check connectivity and retry.',
    );
  if (
    [
      'ProvisionedThroughputExceededException',
      'ThrottlingException',
      'RequestLimitExceeded',
    ].includes(name)
  )
    return new LicenseCliError(
      'AWS request throttled. Retry later with lower administrative activity.',
    );
  if (name === 'ZodError')
    return new LicenseCliError(
      'Invalid stored administrative data. Check the selected table and schema.',
    );
  return new LicenseCliError(
    'License operation failed. Check configuration and AWS availability; no success was confirmed.',
  );
}

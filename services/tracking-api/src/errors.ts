import type { ActivationErrorCode } from '@email-tracker/shared';

export class ActivationError extends Error {
  constructor(
    public readonly code: ActivationErrorCode,
    public readonly statusCode = 403,
  ) {
    super(code);
  }
}

// Se reintenta tras releer el estado; nunca se convierte un fallo AWS en éxito.
export class ConcurrentActivationError extends Error {}

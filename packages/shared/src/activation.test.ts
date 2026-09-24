import { describe, expect, it } from 'vitest';
import {
  activationRequestSchema,
  normalizeActivationCode,
} from './activation.js';

const installationId = '8a73e54e-c33f-40ca-a2dc-06626851744d';
describe('activation contract', () => {
  it('normalizes whitespace and case consistently', () => {
    expect(normalizeActivationCode('  abcd-efgh  ')).toBe('ABCD-EFGH');
    expect(normalizeActivationCode(normalizeActivationCode('abc_defgh'))).toBe(
      'ABC_DEFGH',
    );
  });
  it('accepts and normalizes a reasonable code and UUID', () => {
    expect(
      activationRequestSchema.parse({
        activationCode: ' abcd-efgh ',
        installationId,
      }),
    ).toEqual({ activationCode: 'ABCD-EFGH', installationId });
  });
  it.each([
    '',
    'short',
    'A'.repeat(129),
    'ABCDEFG!',
    'ABCD EFGH',
    'ABCD--EFGH',
    'éèéèéèéè',
  ])('rejects invalid code %s', (activationCode) => {
    expect(
      activationRequestSchema.safeParse({ activationCode, installationId })
        .success,
    ).toBe(false);
  });
  it('rejects invalid UUID and unexpected fields', () => {
    expect(
      activationRequestSchema.safeParse({
        activationCode: 'ABCDEFGH',
        installationId: 'invalid',
      }).success,
    ).toBe(false);
    expect(
      activationRequestSchema.safeParse({
        activationCode: 'ABCDEFGH',
        installationId,
        maxDevices: 100,
      }).success,
    ).toBe(false);
  });
});

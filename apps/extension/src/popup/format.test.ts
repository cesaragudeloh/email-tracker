import { expect, it } from 'vitest';
import { formatDate, formatOpenCount, formatSubject } from './format.js';
it.each([
  [0, '0 opens'],
  [1, '1 open'],
  [3, '3 opens'],
] as const)('formats count %s', (count, expected) =>
  expect(formatOpenCount(count)).toBe(expected),
);
it('formats dates in the user locale and handles missing/invalid dates', () => {
  const value = '2026-09-25T10:00:00Z';
  expect(formatDate(value)).toBe(
    new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value)),
  );
  expect(formatDate(null)).toBe('—');
  expect(formatDate('bad')).toBe('—');
});
it('uses the empty subject fallback', () => {
  expect(formatSubject('  ')).toBe('(No subject)');
  expect(formatSubject('Subject')).toBe('Subject');
});

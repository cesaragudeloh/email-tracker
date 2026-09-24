import './__tests__/dom.js';
import { expect, it, vi } from 'vitest';
import { selectProvider } from './selectProvider.js';
import { GmailAdapter } from './gmail/GmailAdapter.js';

it('selects GmailAdapter for Gmail', () => {
  expect(
    selectProvider(
      new URL('https://mail.google.com/mail/u/1/'),
      document,
      vi.fn(),
    ),
  ).toBeInstanceOf(GmailAdapter);
});

it.each([
  'https://outlook.office.com',
  'https://outlook.live.com',
  'https://example.org',
])('safely leaves %s without an adapter', (url) => {
  expect(selectProvider(new URL(url), document, vi.fn())).toBeUndefined();
});

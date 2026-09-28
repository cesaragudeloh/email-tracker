import './__tests__/dom.js';
import { expect, it, vi } from 'vitest';
import { selectProvider } from './selectProvider.js';
import { GmailAdapter } from './gmail/GmailAdapter.js';
import { OutlookAdapter } from './outlook/OutlookAdapter.js';

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
  'https://outlook.office.com.evil.test',
  'http://outlook.live.com',
  'https://example.org',
])('safely leaves %s without an adapter', (url) => {
  expect(selectProvider(new URL(url), document, vi.fn())).toBeUndefined();
});

it.each(['outlook.office.com', 'outlook.live.com', 'outlook.office365.com'])(
  'selects OutlookAdapter for %s',
  (host) => {
    expect(
      selectProvider(new URL(`https://${host}/mail/`), document, vi.fn()),
    ).toBeInstanceOf(OutlookAdapter);
  },
);

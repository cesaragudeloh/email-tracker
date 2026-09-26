import '../providers/__tests__/dom.js';
import { beforeEach, expect, it, vi } from 'vitest';
import { TrackingView } from './trackingView.js';
import { TrackingQueryError } from '../api/trackingMessages.js';
import { formatDate } from './format.js';
const record = {
  trackingId: crypto.randomUUID(),
  recipient: 'test@example.com',
  subject: '',
  createdAt: '2026-09-25T10:00:00.000Z',
};
const detail = {
  ...record,
  status: 'CREATED' as const,
  openCount: 0,
  firstOpenedAt: null,
  lastOpenedAt: null,
  events: [],
};
const events = [
  {
    eventId: crypto.randomUUID(),
    openedAt: '2026-09-25T11:00:00.000Z',
    ip: '192.0.2.1',
    userAgent: 'Raw test agent',
  },
  {
    eventId: crypto.randomUUID(),
    openedAt: '2026-09-25T12:00:00.000Z',
    ip: null,
    userAgent: null,
  },
];
let root: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement('section');
  document.body.append(root);
});
async function flush() {
  for (let i = 0; i < 15; i++) await Promise.resolve();
}
function button(text: string) {
  return Array.from(root.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(text),
  )!;
}
function setup() {
  const api = {
    list: vi.fn().mockResolvedValue([record]),
    get: vi.fn().mockResolvedValue(detail),
  };
  const view = new TrackingView(root, api);
  return { api, view };
}
it('does not show or fetch protected history before activation', async () => {
  const { api, view } = setup();
  view.setActivated(false);
  await flush();
  expect(root.hidden).toBe(true);
  expect(root.textContent).toBe('');
  expect(api.list).not.toHaveBeenCalled();
});
it('activated list shows subject fallback, recipient and newest first without fetching details', async () => {
  const { api, view } = setup();
  api.list.mockResolvedValue([
    record,
    {
      ...record,
      trackingId: crypto.randomUUID(),
      subject: 'Newest',
      createdAt: '2026-09-26T10:00:00.000Z',
    },
  ]);
  view.setActivated(true);
  await flush();
  expect(root.hidden).toBe(false);
  expect(root.textContent).toContain('Recent tracked emails');
  expect(root.textContent).toContain('(No subject)');
  expect(root.textContent).toContain(record.recipient);
  expect(root.querySelector('li')?.textContent).toContain('Newest');
  expect(api.get).not.toHaveBeenCalled();
  view.setActivated(true);
  await flush();
  expect(api.list).toHaveBeenCalledOnce();
});
it('shows an empty list message', async () => {
  const { api, view } = setup();
  api.list.mockResolvedValue([]);
  view.setActivated(true);
  await flush();
  expect(root.textContent).toContain('No tracked emails yet.');
});
it('shows loading, CREATED, zero opens and no empty History heading', async () => {
  const { view, api } = setup();
  view.setActivated(true);
  await flush();
  button('(No subject)').click();
  expect(root.textContent).toContain('Loading…');
  expect(button('Refresh').disabled).toBe(true);
  await flush();
  expect(api.get).toHaveBeenCalledExactlyOnceWith(record.trackingId);
  expect(root.textContent).toContain('Not opened yet');
  expect(root.textContent).toContain('0 opens');
  expect(root.textContent).toContain('No opens detected yet.');
  expect(root.querySelector('h3')).toBeNull();
});
it.each([1, 3])(
  'renders OPEN_DETECTED, %s opens, dates and newest events first',
  async (count) => {
    const { view, api } = setup();
    api.get.mockResolvedValue({
      ...detail,
      status: 'OPEN_DETECTED',
      openCount: count,
      firstOpenedAt: events[0].openedAt,
      lastOpenedAt: events[1].openedAt,
      events,
    });
    view.setActivated(true);
    await flush();
    button('(No subject)').click();
    await flush();
    expect(root.textContent).toContain('Open detected');
    expect(root.textContent).toContain(count === 1 ? '1 open' : '3 opens');
    expect(root.textContent).toContain(formatDate(events[0].openedAt));
    expect(root.textContent).toContain(formatDate(events[1].openedAt));
    expect(
      Array.from(root.querySelectorAll('time')).map((node) => node.dateTime),
    ).toEqual([events[1].openedAt, events[0].openedAt]);
    expect(root.textContent).toContain('IP: 192.0.2.1');
    expect(root.textContent).toContain('IP unavailable');
    expect(root.querySelector('details')?.textContent).toContain(
      'Raw test agent',
    );
    expect(events[0].ip).toBe('192.0.2.1');
  },
);
it('Refresh fetches again; Back returns to the list without another GET', async () => {
  const { view, api } = setup();
  view.setActivated(true);
  await flush();
  button('(No subject)').click();
  await flush();
  button('Refresh').click();
  await flush();
  expect(api.get).toHaveBeenCalledTimes(2);
  button('Back').click();
  await flush();
  expect(root.textContent).toContain('Recent tracked emails');
  expect(api.get).toHaveBeenCalledTimes(2);
});
it.each([
  ['NOT_FOUND', 'Tracking record not found'],
  ['UNAUTHORIZED', 'Authorization expired'],
  ['SERVICE_UNAVAILABLE', 'Unable to load tracking information'],
] as const)('handles %s with Refresh and Back', async (code, text) => {
  const { view, api } = setup();
  api.get.mockRejectedValue(new TrackingQueryError(code));
  view.setActivated(true);
  await flush();
  button('(No subject)').click();
  await flush();
  expect(root.querySelector('[role="alert"]')?.textContent).toBe(text);
  expect(button('Refresh').disabled).toBe(false);
  expect(button('Back')).toBeTruthy();
  api.get.mockResolvedValue(detail);
  button('Refresh').click();
  await flush();
  expect(root.textContent).toContain('Not opened yet');
});
it('list storage/network error can be retried', async () => {
  const { api, view } = setup();
  api.list.mockRejectedValueOnce(new Error('private'));
  view.setActivated(true);
  await flush();
  expect(root.textContent).toContain('Unable to load tracking information');
  expect(root.textContent).not.toContain('private');
  button('Retry').click();
  await flush();
  expect(root.textContent).toContain('(No subject)');
});
it('ignores a late detail after Back and clears history when deactivated', async () => {
  const { api, view } = setup();
  let resolve!: (value: typeof detail) => void;
  api.get.mockReturnValue(
    new Promise((res) => {
      resolve = res;
    }),
  );
  view.setActivated(true);
  await flush();
  button('(No subject)').click();
  button('Back').click();
  await flush();
  resolve(detail);
  await flush();
  expect(root.textContent).toContain('Recent tracked emails');
  view.setActivated(false);
  expect(root.hidden).toBe(true);
  expect(root.textContent).toBe('');
});
it('ignores late list response after deactivation', async () => {
  const { api, view } = setup();
  let resolve!: (value: (typeof record)[]) => void;
  api.list.mockReturnValue(
    new Promise((res) => {
      resolve = res;
    }),
  );
  view.setActivated(true);
  view.setActivated(false);
  resolve([record]);
  await flush();
  expect(root.hidden).toBe(true);
  expect(root.textContent).toBe('');
});
it('renders external metadata and raw User-Agent as text, never HTML', async () => {
  const { api, view } = setup();
  const payload = '<img src=x onerror=alert(1)>';
  api.list.mockResolvedValue([{ ...record, subject: payload }]);
  api.get.mockResolvedValue({
    ...detail,
    subject: payload,
    events: [{ ...events[0], userAgent: payload }],
  });
  view.setActivated(true);
  await flush();
  expect(root.querySelector('img')).toBeNull();
  button(payload).click();
  await flush();
  expect(root.querySelector('img')).toBeNull();
  expect(root.textContent).toContain(payload);
});

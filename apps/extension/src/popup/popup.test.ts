import '../providers/__tests__/dom.js';
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  activate: vi.fn(),
  list: vi.fn(),
}));
vi.mock('../api/activationMessages.js', () => ({
  activationBridge: { getState: mocks.getState, activate: mocks.activate },
}));
vi.mock('../api/trackingMessages.js', async (original) => ({
  ...(await original<object>()),
  requestTrackingList: mocks.list,
}));
const state = { installationId: crypto.randomUUID(), activated: false };
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.body.innerHTML = readFileSync(
    new URL('../../popup.html', import.meta.url),
    'utf8',
  )
    .split('<body>')[1]
    .split('</body>')[0];
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  mocks.getState.mockResolvedValue(state);
  mocks.activate.mockResolvedValue({ ...state, activated: true });
  mocks.list.mockResolvedValue([]);
});
it('inactive popup retains activation and never fetches history', async () => {
  await import('./popup.js');
  await flush();
  expect(document.querySelector('#activation-status')?.textContent).toBe(
    'Not activated',
  );
  expect(
    (document.querySelector('#tracking-history') as HTMLElement).hidden,
  ).toBe(true);
  expect(mocks.list).not.toHaveBeenCalled();
});
it('activated popup displays the list without directly reading token storage', async () => {
  mocks.getState.mockResolvedValue({ ...state, activated: true });
  await import('./popup.js');
  await flush();
  expect(document.querySelector('#activation-status')?.textContent).toBe(
    'Activated',
  );
  expect(document.querySelector('#tracking-history')?.textContent).toContain(
    'No tracked emails yet.',
  );
  expect(
    (document.querySelector('#activation-form') as HTMLElement).hidden,
  ).toBe(true);
});
it('activation submits through worker, clears code and reveals history', async () => {
  await import('./popup.js');
  await flush();
  const code = document.querySelector<HTMLInputElement>('#activation-code')!;
  code.value = 'TEST-CODE';
  document
    .querySelector('form')!
    .dispatchEvent(
      new document.defaultView!.Event('submit', { cancelable: true }),
    );
  await flush();
  expect(mocks.activate).toHaveBeenCalledExactlyOnceWith('TEST-CODE');
  expect(code.value).toBe('');
  expect(document.querySelector('#tracking-history')?.textContent).toContain(
    'No tracked emails yet.',
  );
});
it('failed state lookup hides protected content safely', async () => {
  mocks.getState.mockRejectedValue(new Error('private'));
  await import('./popup.js');
  await flush();
  expect(
    (document.querySelector('#tracking-history') as HTMLElement).hidden,
  ).toBe(true);
  expect(document.querySelector('#activation-message')?.textContent).toBe(
    'Activation service unavailable',
  );
  expect(mocks.list).not.toHaveBeenCalled();
});

it('ignores an old authorization-state response after successful activation', async () => {
  await import('./popup.js');
  await flush();
  let resolve!: (value: typeof state) => void;
  mocks.getState.mockReturnValueOnce(
    new Promise((res) => {
      resolve = res;
    }),
  );
  const focus = vi
    .mocked(window.addEventListener)
    .mock.calls.find(([name]) => name === 'focus')![1] as () => void;
  focus();
  document.querySelector<HTMLInputElement>('#activation-code')!.value =
    'TEST-CODE';
  document
    .querySelector('form')!
    .dispatchEvent(
      new document.defaultView!.Event('submit', { cancelable: true }),
    );
  await flush();
  resolve(state);
  await flush();
  expect(document.querySelector('#activation-status')?.textContent).toBe(
    'Activated',
  );
  expect(
    (document.querySelector('#tracking-history') as HTMLElement).hidden,
  ).toBe(false);
});
it('does not periodically refresh authorization or history', async () => {
  vi.useFakeTimers();
  try {
    mocks.getState.mockResolvedValue({ ...state, activated: true });
    await import('./popup.js');
    await flush();
    await vi.advanceTimersByTimeAsync(120000);
    expect(mocks.getState).toHaveBeenCalledOnce();
    expect(mocks.list).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

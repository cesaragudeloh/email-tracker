import '../__tests__/dom.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GmailSendController } from './GmailSendController.js';
import { GmailTrackingControls } from './GmailTrackingControls.js';
import { GmailAdapter } from './GmailAdapter.js';
import { TrackingClientError } from '../../api/trackingClient.js';
import type { CreateTrackingResponse } from '@email-tracker/shared';

const result: CreateTrackingResponse = {
  trackingId: crypto.randomUUID(),
  trackingUrl: 'https://tracking.example.test/o/test',
  createdAt: '2026-09-25T10:00:00.000Z',
};
const controllers: GmailSendController[] = [];
const adapters: GmailAdapter[] = [];
function fixture(recipient = 'first@example.com', subject = 'Current subject') {
  const compose = document.createElement('section');
  compose.setAttribute('role', 'dialog');
  compose.innerHTML =
    '<input name="subjectbox"><table><tbody><tr><td><input name="to"></td></tr></tbody></table>' +
    '<div role="textbox" contenteditable="true"><b>Private body</b><div class="signature">Signature <a href="https://example.com">Link</a><img src="https://example.com/signature.png"></div></div>' +
    '<footer><div role="group"><div role="button" tabindex="0" data-tooltip="Enviar (Ctrl-Enter)"><span>Send</span></div></div></footer>';
  compose.querySelector<HTMLInputElement>('[name="to"]')!.value = recipient;
  compose.querySelector<HTMLInputElement>('[name="subjectbox"]')!.value =
    subject;
  document.body.append(compose);
  return compose;
}
function setup(compose = fixture()) {
  const controls = new GmailTrackingControls();
  controls.ensureAttached(compose);
  const create = vi.fn().mockResolvedValue(result);
  const warn = vi.fn();
  const created = vi.fn();
  const pixelWarning = vi.fn();
  const controller = new GmailSendController(
    document,
    controls,
    create,
    warn,
    created,
    pixelWarning,
  );
  controllers.push(controller);
  controller.start();
  const toggle = compose
    .querySelector('.email-tracker-toggle')!
    .shadowRoot!.querySelector<HTMLInputElement>('input')!;
  const send = compose.querySelector<HTMLElement>('[data-tooltip]')!;
  const native = vi.fn();
  send.addEventListener('click', native);
  return {
    compose,
    pixelWarning,
    controls,
    create,
    warn,
    created,
    controller,
    toggle,
    send,
    native,
  };
}
function deferred() {
  let resolve!: (value: CreateTrackingResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<CreateTrackingResponse>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
function key(target: HTMLElement, options: KeyboardEventInit) {
  const event = new document.defaultView!.KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
}
beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal('chrome', {
    storage: { local: { set: vi.fn(), get: vi.fn() } },
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ ok: true, tracking: result }),
    },
  });
});
afterEach(() => {
  controllers.splice(0).forEach((c) => c.stop());
  adapters.splice(0).forEach((a) => a.stop());
  vi.useRealTimers();
});

it('OFF allows native Send immediately without calling createTracking', async () => {
  const { send, native, create } = setup();
  send.click();
  expect(native).toHaveBeenCalledOnce();
  await flush();
  expect(document.querySelector('[data-email-tracker-id]')).toBeNull();
  expect(create).not.toHaveBeenCalled();
  expect(native.mock.calls[0][0].defaultPrevented).toBe(false);
});
it('ON blocks Send until tracking is created, stores result, then resumes once without recursion', async () => {
  const { toggle, send, create, native, controller, compose, created } =
    setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  toggle.click();
  send.click();
  expect(native).not.toHaveBeenCalled();
  await flush();
  expect(create).toHaveBeenCalledExactlyOnceWith({
    recipient: 'first@example.com',
    subject: 'Current subject',
  });
  expect(controller.getTracking(compose)).toBeUndefined();
  pending.resolve(result);
  await flush();
  expect(controller.getTracking(compose)).toEqual(result);
  expect(created).toHaveBeenCalledOnce();
  expect(native).toHaveBeenCalledOnce();
  expect(create).toHaveBeenCalledOnce();
});
it.each(['', 'missing'])(
  'accepts empty or absent subject: %s',
  async (value) => {
    const compose = fixture('first@example.com', '');
    if (value === 'missing')
      compose.querySelector('[name="subjectbox"]')!.remove();
    const { toggle, send, create } = setup(compose);
    toggle.click();
    send.click();
    await flush();
    expect(create).toHaveBeenCalledWith({
      recipient: 'first@example.com',
      subject: '',
    });
  },
);
it.each(['', 'not-an-email'])(
  'missing or invalid recipient %s leaves native validation in control',
  async (recipient) => {
    const { toggle, send, native, create, warn } = setup(fixture(recipient));
    toggle.click();
    send.click();
    await flush();
    expect(native).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  },
);
it('uses first valid To chip ahead of the unfinished input and excludes Cc', async () => {
  const compose = fixture('unfinished');
  compose
    .querySelector('td')!
    .insertAdjacentHTML(
      'afterbegin',
      '<span email="first@example.com"></span><span data-hovercard-id="second@example.com"></span>',
    );
  compose.insertAdjacentHTML(
    'afterbegin',
    '<input name="cc" value="cc@example.com">',
  );
  const { toggle, send, create } = setup(compose);
  toggle.click();
  send.click();
  await flush();
  expect(create).toHaveBeenCalledWith({
    recipient: 'first@example.com',
    subject: 'Current subject',
  });
});
it('supports a To region with modern data-hovercard-id chips', async () => {
  const compose = fixture('');
  compose.querySelector('table')!.remove();
  compose.insertAdjacentHTML(
    'afterbegin',
    '<div data-name="to"><span data-hovercard-id="modern@example.com"></span></div>',
  );
  const { toggle, send, create } = setup(compose);
  toggle.click();
  send.click();
  await flush();
  expect(create.mock.calls[0][0].recipient).toBe('modern@example.com');
});
it('uses first valid email in a typed To list with display names', async () => {
  const { toggle, send, create } = setup(
    fixture('Person <first@example.com>; second@example.com'),
  );
  toggle.click();
  send.click();
  await flush();
  expect(create.mock.calls[0][0].recipient).toBe('first@example.com');
});
it('does not take recipients or subject from quoted content or nested dialogs', async () => {
  const compose = fixture('');
  compose.querySelector('[name="subjectbox"]')!.remove();
  compose.querySelector('[contenteditable]')!.innerHTML =
    '<input name="to" value="quoted@example.com"><input name="subjectbox" value="Quoted">';
  compose.insertAdjacentHTML(
    'beforeend',
    '<div role="dialog"><input name="to" value="nested@example.com"></div>',
  );
  const { toggle, send, create, native } = setup(compose);
  toggle.click();
  send.click();
  await flush();
  expect(create).not.toHaveBeenCalled();
  expect(native).toHaveBeenCalledOnce();
});
it('keeps two compose contexts and metadata independent', async () => {
  const first = setup();
  const secondCompose = fixture('second@example.com', 'Second');
  first.controls.ensureAttached(secondCompose);
  const secondToggle = secondCompose
    .querySelector('.email-tracker-toggle')!
    .shadowRoot!.querySelector<HTMLInputElement>('input')!;
  const secondResult = { ...result, trackingId: crypto.randomUUID() };
  first.create
    .mockResolvedValueOnce(result)
    .mockResolvedValueOnce(secondResult);
  first.toggle.click();
  secondToggle.click();
  first.send.click();
  secondCompose.querySelector<HTMLElement>('[data-tooltip]')!.click();
  await flush();
  expect(first.create.mock.calls.map((call) => call[0])).toEqual([
    { recipient: 'first@example.com', subject: 'Current subject' },
    { recipient: 'second@example.com', subject: 'Second' },
  ]);
  expect(first.controller.getTracking(first.compose)).toEqual(result);
  expect(first.controller.getTracking(secondCompose)).toEqual(secondResult);
  expect(
    first.compose
      .querySelector('img[data-email-tracker-id]')
      ?.getAttribute('data-email-tracker-id'),
  ).toBe(result.trackingId);
  expect(
    secondCompose
      .querySelector('img[data-email-tracker-id]')
      ?.getAttribute('data-email-tracker-id'),
  ).toBe(secondResult.trackingId);
});
it('double click and bubbling produce one in-flight request and one resumed Send', async () => {
  const { toggle, send, create, native } = setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  toggle.click();
  send.querySelector<HTMLElement>('span')!.click();
  send.click();
  send.click();
  await flush();
  expect(create).toHaveBeenCalledOnce();
  expect(native).not.toHaveBeenCalled();
  pending.resolve(result);
  await flush();
  expect(native).toHaveBeenCalledOnce();
  send.click();
  await flush();
  expect(create).toHaveBeenCalledOnce();
});
it('duplicate controllers and repeated start share locking and resume authorization', async () => {
  const { toggle, send, create, native, controller, controls } = setup();
  controller.start();
  const secondCreate = vi.fn();
  const second = new GmailSendController(document, controls, secondCreate);
  controllers.push(second);
  second.start();
  toggle.click();
  send.click();
  await flush();
  expect(create).toHaveBeenCalledOnce();
  expect(secondCreate).not.toHaveBeenCalled();
  expect(native).toHaveBeenCalledOnce();
});
it.each([
  new Error('network secret'),
  new TrackingClientError('UNAUTHORIZED'),
  new TrackingClientError('SERVICE_UNAVAILABLE'),
])(
  'failure resumes without tracking and without retry loops: %s',
  async (error) => {
    const { toggle, send, create, native, warn, controller, compose } = setup();
    create.mockRejectedValue(error);
    toggle.click();
    send.click();
    await flush();
    expect(native).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledExactlyOnceWith();
    expect(controller.getTracking(compose)).toBeUndefined();
    expect(compose.querySelector('[data-email-tracker-id]')).toBeNull();
    send.click();
    await flush();
    expect(create).toHaveBeenCalledOnce();
  },
);
it('bounds stalled creation to 20 seconds and ignores a late success', async () => {
  vi.useFakeTimers();
  const { toggle, send, create, native, controller, compose, warn } = setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  toggle.click();
  send.click();
  await flush();
  await vi.advanceTimersByTimeAsync(19999);
  expect(native).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(native).toHaveBeenCalledOnce();
  expect(warn).toHaveBeenCalledOnce();
  pending.resolve(result);
  await flush();
  expect(controller.getTracking(compose)).toBeUndefined();
  expect(native).toHaveBeenCalledOnce();
});
it('removed compose during creation does not resume or associate a result', async () => {
  const { toggle, send, create, compose, native, controller } = setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  toggle.click();
  send.click();
  compose.remove();
  pending.resolve(result);
  await flush();
  expect(native).not.toHaveBeenCalled();
  expect(controller.getTracking(compose)).toBeUndefined();
});
it('finds the new Send button after Gmail rebuilds the actions while waiting', async () => {
  const { toggle, send, create, compose } = setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  toggle.click();
  send.click();
  const replacement = send.cloneNode(true) as HTMLElement;
  send.replaceWith(replacement);
  const native = vi.fn();
  replacement.addEventListener('click', native);
  pending.resolve(result);
  await flush();
  expect(native).toHaveBeenCalledOnce();
  expect(create).toHaveBeenCalledOnce();
  expect(compose.contains(replacement)).toBe(true);
});
it('missing Send after request releases the lock and warns without throwing', async () => {
  const { toggle, send, create, warn } = setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  toggle.click();
  send.click();
  send.remove();
  pending.resolve(result);
  await flush();
  expect(warn).toHaveBeenCalledOnce();
});
it('preserves original nodes/subject/native Send and never stores body or pixel', async () => {
  const { toggle, send, compose, create } = setup();
  const editor = compose.querySelector('[contenteditable]')!;
  const original = Array.from(editor.childNodes);
  const markup = original.map((node) => (node as Element).outerHTML);
  const button = send.outerHTML;
  toggle.click();
  send.click();
  await flush();
  expect(Array.from(editor.childNodes).slice(0, -1)).toEqual(original);
  expect(original.map((node) => (node as Element).outerHTML)).toEqual(markup);
  expect(send.outerHTML).toBe(button);
  expect(compose.querySelectorAll('img[data-email-tracker-id]')).toHaveLength(
    1,
  );
  expect(
    compose.querySelector<HTMLInputElement>('[name="subjectbox"]')!.value,
  ).toBe('Current subject');
  expect(create).toHaveBeenCalledOnce();
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
  expect(chrome.storage.local.get).not.toHaveBeenCalled();
});
it.each([{ ctrlKey: true }, { metaKey: true }])(
  'captures Send keyboard shortcut %j before Gmail handlers',
  async (modifiers) => {
    const { toggle, compose, native, create } = setup();
    toggle.click();
    const event = key(
      compose.querySelector<HTMLElement>('[contenteditable]')!,
      { key: 'Enter', ...modifiers },
    );
    expect(event.defaultPrevented).toBe(true);
    native.mockImplementation(() =>
      expect(
        compose.querySelectorAll('img[data-email-tracker-id]'),
      ).toHaveLength(1),
    );
    expect(native).not.toHaveBeenCalled();
    await flush();
    expect(native).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  },
);
it.each(['Enter', ' '])(
  'captures keyboard activation on Send: %s',
  async (value) => {
    const { toggle, send, native, create } = setup();
    toggle.click();
    key(send, { key: value });
    await flush();
    expect(create).toHaveBeenCalledOnce();
    expect(native).toHaveBeenCalledOnce();
  },
);
it('OFF shortcut and normal editor keys remain untouched', () => {
  const { compose, toggle, create } = setup();
  const editor = compose.querySelector<HTMLElement>('[contenteditable]')!;
  expect(key(editor, { key: 'Enter', ctrlKey: true }).defaultPrevented).toBe(
    false,
  );
  toggle.click();
  expect(key(editor, { key: 'Enter' }).defaultPrevented).toBe(false);
  expect(create).not.toHaveBeenCalled();
});
it('toggle OFF while pending does not let a second Send escape early', async () => {
  const { toggle, send, create, native, controller, compose } = setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  toggle.click();
  send.click();
  toggle.click();
  send.click();
  expect(native).not.toHaveBeenCalled();
  pending.resolve(result);
  await flush();
  expect(native).toHaveBeenCalledOnce();
  expect(controller.getTracking(compose)).toBeUndefined();
  expect(create).toHaveBeenCalledOnce();
});
it('metadata edits while waiting discard stale result and resume without another request', async () => {
  const { toggle, send, create, native, controller, compose, warn } = setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  toggle.click();
  send.click();
  compose.querySelector<HTMLInputElement>('[name="subjectbox"]')!.value =
    'Edited';
  pending.resolve(result);
  await flush();
  expect(controller.getTracking(compose)).toBeUndefined();
  expect(warn).toHaveBeenCalledOnce();
  expect(native).toHaveBeenCalledOnce();
  send.click();
  await flush();
  expect(create).toHaveBeenCalledOnce();
});
it('a later attempt with changed metadata creates a new result', async () => {
  const { toggle, send, create, compose } = setup();
  toggle.click();
  send.click();
  await flush();
  compose.querySelector<HTMLInputElement>('[name="subjectbox"]')!.value =
    'Edited';
  send.click();
  await flush();
  expect(create).toHaveBeenCalledTimes(2);
});
it('stop removes listeners while allowing any pending native resume to finish', async () => {
  const { toggle, send, create, native, controller } = setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  toggle.click();
  send.click();
  controller.stop();
  pending.resolve(result);
  await flush();
  expect(native).toHaveBeenCalledOnce();
  send.click();
  expect(native).toHaveBeenCalledTimes(2);
  expect(create).toHaveBeenCalledOnce();
});
it('GmailAdapter wires runtime messaging once even with duplicate adapters and mutations', async () => {
  const compose = fixture();
  const first = new GmailAdapter(document, vi.fn());
  const second = new GmailAdapter(document, vi.fn());
  adapters.push(first, second);
  first.start();
  second.start();
  first.start();
  compose
    .querySelector('.email-tracker-toggle')!
    .shadowRoot!.querySelector<HTMLInputElement>('input')!
    .click();
  compose.append(document.createElement('aside'));
  await flush();
  const send = compose.querySelector<HTMLElement>('[data-tooltip]')!;
  const native = vi.fn();
  send.addEventListener('click', native);
  send.click();
  send.click();
  await flush();
  expect(chrome.runtime.sendMessage).toHaveBeenCalledExactlyOnceWith({
    type: 'email-tracker:create-tracking',
    request: { recipient: 'first@example.com', subject: 'Current subject' },
  });
  expect(native).toHaveBeenCalledOnce();
});

it('clears an earlier tracking result when a later Send has invalid metadata', async () => {
  const { toggle, send, compose, controller, create, native } = setup();
  toggle.click();
  send.click();
  await flush();
  expect(controller.getTracking(compose)).toEqual(result);
  compose.querySelector<HTMLInputElement>('[name="to"]')!.value = '';
  send.click();
  await flush();
  expect(controller.getTracking(compose)).toBeUndefined();
  expect(create).toHaveBeenCalledOnce();
  expect(native).toHaveBeenCalledTimes(2);
});
it('does not create tracking for disabled Send or noncancelable events', async () => {
  const { toggle, send, create } = setup();
  toggle.click();
  send.setAttribute('aria-disabled', 'true');
  send.click();
  send.removeAttribute('aria-disabled');
  send.dispatchEvent(
    new document.defaultView!.MouseEvent('click', {
      bubbles: true,
      cancelable: false,
    }),
  );
  await flush();
  expect(create).not.toHaveBeenCalled();
});
it.each(['Senden (Ctrl-Enter)', '送信（⌘Enter）'])(
  'intercepts using shortcut metadata across languages: %s',
  async (label) => {
    const { toggle, send, create, native } = setup();
    send.setAttribute('data-tooltip', label);
    toggle.click();
    send.click();
    await flush();
    expect(create).toHaveBeenCalledOnce();
    expect(native).toHaveBeenCalledOnce();
  },
);

it('inserts before native resume and reuses exactly one pixel for mixed repeated Send', async () => {
  const { compose, toggle, send, native, create } = setup(
    fixture('first@example.com; second@example.com'),
  );
  native.mockImplementation(() =>
    expect(compose.querySelectorAll('img[data-email-tracker-id]')).toHaveLength(
      1,
    ),
  );
  toggle.click();
  key(compose.querySelector<HTMLElement>('[contenteditable]')!, {
    key: 'Enter',
    ctrlKey: true,
  });
  send.click();
  await flush();
  const pixel = compose.querySelector('img[data-email-tracker-id]');
  send.click();
  await flush();
  expect(compose.querySelector('img[data-email-tracker-id]')).toBe(pixel);
  expect(create).toHaveBeenCalledOnce();
  expect(native).toHaveBeenCalledTimes(2);
});
it.each(['missing body', 'DOM exception', 'invalid URL'])(
  'resumes without a pixel for %s and retains context for retry',
  async (failure) => {
    const { compose, toggle, send, create, native, pixelWarning, controller } =
      setup();
    const body = compose.querySelector<HTMLElement>('[contenteditable]')!;
    let restore = () => {};
    if (failure === 'missing body') {
      body.remove();
      restore = () => compose.append(body);
    }
    if (failure === 'DOM exception') {
      const spy = vi.spyOn(body, 'appendChild').mockImplementation(() => {
        throw new Error('DOM failure');
      });
      restore = () => spy.mockRestore();
    }
    const response =
      failure === 'invalid URL'
        ? { ...result, trackingUrl: 'http://example.com/o/test' }
        : result;
    create.mockResolvedValue(response);
    toggle.click();
    send.click();
    await flush();
    expect(native).toHaveBeenCalledOnce();
    expect(pixelWarning).toHaveBeenCalledExactlyOnceWith();
    expect(compose.querySelector('[data-email-tracker-id]')).toBeNull();
    expect(controller.getTracking(compose)).toEqual(response);
    restore();
    send.click();
    await flush();
    expect(create).toHaveBeenCalledOnce();
    expect(native).toHaveBeenCalledTimes(2);
    expect(compose.querySelectorAll('[data-email-tracker-id]')).toHaveLength(
      failure === 'invalid URL' ? 0 : 1,
    );
  },
);
it('repairs a replaced editor on retry without creating another record', async () => {
  const { compose, toggle, send, create } = setup();
  toggle.click();
  send.click();
  await flush();
  const body = compose.querySelector('[contenteditable]')!;
  const replacement = body.cloneNode(false);
  body.replaceWith(replacement);
  send.click();
  await flush();
  expect(compose.querySelectorAll('[data-email-tracker-id]')).toHaveLength(1);
  expect(create).toHaveBeenCalledOnce();
});
it('removes an earlier pixel when sending OFF and can reuse tracking when enabled again', async () => {
  const { compose, toggle, send, create } = setup();
  toggle.click();
  send.click();
  await flush();
  toggle.click();
  send.click();
  expect(compose.querySelector('[data-email-tracker-id]')).toBeNull();
  toggle.click();
  send.click();
  await flush();
  expect(compose.querySelectorAll('[data-email-tracker-id]')).toHaveLength(1);
  expect(create).toHaveBeenCalledOnce();
});
it('removes stale pixels before a changed-metadata request fails', async () => {
  const { compose, toggle, send, create } = setup();
  toggle.click();
  send.click();
  await flush();
  compose.querySelector<HTMLInputElement>('[name="subjectbox"]')!.value = 'New';
  create.mockRejectedValue(new Error('offline'));
  send.click();
  await flush();
  expect(compose.querySelector('[data-email-tracker-id]')).toBeNull();
});

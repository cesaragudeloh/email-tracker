import '../__tests__/dom.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CreateTrackingResponse } from '@email-tracker/shared';
import { OutlookAdapter } from './OutlookAdapter.js';
import { outlookDom } from './outlookSelectors.js';
import { ComposeSendController } from '../shared/ComposeSendController.js';
import { ComposeTrackingControls } from '../shared/ComposeTrackingControls.js';
import { createTrackingRecorder } from '../../tracking/trackingRecorder.js';

const result: CreateTrackingResponse = {
  trackingId: crypto.randomUUID(),
  trackingUrl: 'https://example.test/o/id',
  createdAt: '2026-09-27T10:00:00.000Z',
};
const cleanups: (() => void)[] = [];
function fixture(spanish = false) {
  const node = document.createElement('section');
  node.setAttribute('role', 'dialog');
  node.innerHTML = `<div><span title="First &lt;first@example.com&gt;">First</span><span data-email-address="second@example.com">Second</span><input aria-label="${spanish ? 'Para' : 'To'}" value="unfinished"></div>
    <input aria-label="${spanish ? 'Asunto' : 'Subject'}" value="Test subject">
    <div role="textbox" contenteditable="true" aria-multiline="true"><b>Body</b><div>Signature</div><blockquote>Quote</blockquote></div>
    <footer><button aria-label="${spanish ? 'Enviar' : 'Send'} (Ctrl+Enter)"><span>Send</span></button><button>Options</button></footer>`;
  document.body.append(node);
  return node;
}
function toggle(node: HTMLElement) {
  return node
    .querySelector('.email-tracker-toggle')!
    .shadowRoot!.querySelector<HTMLInputElement>('input')!;
}
function adapter() {
  const detected = vi.fn();
  const instance = new OutlookAdapter(document, detected);
  cleanups.push(() => instance.stop());
  instance.start();
  return { instance, detected };
}
function setup(node = fixture()) {
  const { instance } = adapter();
  instance.stop();
  const create = vi.fn().mockResolvedValue(result);
  const warning = vi.fn();
  const pixelWarning = vi.fn();
  const controls = new ComposeTrackingControls(outlookDom);
  const controller = new ComposeSendController(
    document,
    controls,
    outlookDom,
    create,
    warning,
    vi.fn(),
    pixelWarning,
  );
  cleanups.push(() => controller.stop());
  controller.start();
  const send = outlookDom.findSend(node)!;
  const native = vi.fn();
  send.addEventListener('click', native);
  return {
    node,
    create,
    warning,
    pixelWarning,
    controller,
    send,
    native,
    input: toggle(node),
  };
}
async function flush() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
async function mutations() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
function key(node: HTMLElement, init: KeyboardEventInit) {
  const event = new document.defaultView!.KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  node.dispatchEvent(event);
  return event;
}
function deferred() {
  let resolve!: (value: CreateTrackingResponse) => void;
  const promise = new Promise<CreateTrackingResponse>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ ok: true, tracking: result }),
    },
  });
});
afterEach(() => {
  cleanups.splice(0).forEach((stop) => stop());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each([false, true])(
  'detects compose and an isolated OFF toggle, Spanish=%s',
  (spanish) => {
    const node = fixture(spanish);
    const { detected } = adapter();
    expect(detected).toHaveBeenCalledExactlyOnceWith(node);
    expect(toggle(node).checked).toBe(false);
    expect(node.querySelector('.email-tracker-toggle')!.parentElement).toBe(
      node.querySelector('footer'),
    );
    expect(
      node
        .querySelector('.email-tracker-toggle')!
        .shadowRoot!.querySelector('style'),
    ).not.toBeNull();
    expect(outlookDom.readMetadata(node)).toEqual({
      recipient: 'first@example.com',
      subject: 'Test subject',
    });
  },
);
it('detects independent inline and new compose windows added dynamically', async () => {
  const { detected } = adapter();
  const first = fixture();
  first.removeAttribute('role');
  const second = fixture();
  await mutations();
  toggle(first).click();
  expect(toggle(second).checked).toBe(false);
  expect(detected.mock.calls).toEqual([[first], [second]]);
  first.remove();
  const third = fixture();
  await mutations();
  expect(toggle(third).checked).toBe(false);
});
it('repeated start, duplicate adapters and observer mutations do not duplicate controls or requests', async () => {
  const node = fixture();
  const { instance, detected } = adapter();
  instance.start();
  adapter();
  toggle(node).click();
  node.querySelector('[contenteditable]')!.append(document.createElement('b'));
  await mutations();
  expect(detected).toHaveBeenCalledOnce();
  expect(node.querySelectorAll('.email-tracker-toggle')).toHaveLength(1);
  const send = outlookDom.findSend(node)!;
  const native = vi.fn();
  send.addEventListener('click', native);
  send.click();
  send.click();
  await flush();
  expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
  expect(native).toHaveBeenCalledOnce();
});
it('restores the same toggle after actions are replaced', async () => {
  const node = fixture();
  adapter();
  const input = toggle(node);
  input.click();
  node.querySelector('footer')!.innerHTML =
    '<button aria-label="Send">Send</button>';
  await mutations();
  expect(toggle(node)).toBe(input);
  expect(input.checked).toBe(true);
});
it('waits for incrementally added editor attributes and actions', async () => {
  const node = fixture();
  const body = node.querySelector('[contenteditable]')!;
  body.removeAttribute('aria-multiline');
  const { detected } = adapter();
  expect(detected).not.toHaveBeenCalled();
  body.setAttribute('aria-label', 'Message body');
  await mutations();
  expect(detected).toHaveBeenCalledExactlyOnceWith(node);
});
it('ignores quoted editors, generic dialogs and unrelated editable controls', () => {
  document.body.innerHTML =
    '<div role="dialog"><input><footer><button>Send</button></footer></div><div contenteditable="true" role="combobox"></div><blockquote><div contenteditable="true" role="textbox" aria-multiline="true"></div><button>Send</button></blockquote>';
  const { detected } = adapter();
  expect(detected).not.toHaveBeenCalled();
});
it('stop disconnects observer and listeners; restart detects only new compose', async () => {
  const node = fixture();
  const { instance, detected } = adapter();
  toggle(node).click();
  instance.stop();
  outlookDom.findSend(node)!.click();
  const second = fixture();
  await mutations();
  expect(second.querySelector('.email-tracker-toggle')).toBeNull();
  expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  instance.start();
  expect(detected).toHaveBeenCalledTimes(2);
});
it('OFF passes click and shortcut untouched without tracking', async () => {
  const { node, send, native, create } = setup();
  send.click();
  expect(
    key(outlookDom.findBody(node)!, { key: 'Enter', ctrlKey: true })
      .defaultPrevented,
  ).toBe(false);
  await flush();
  expect(native).toHaveBeenCalledOnce();
  expect(create).not.toHaveBeenCalled();
  expect(node.querySelector('img[data-email-tracker-id]')).toBeNull();
});
it('ON sends metadata only, inserts one pixel in the body, preserving signature/quote, before native send', async () => {
  const { node, input, send, create, native } = setup();
  const body = outlookDom.findBody(node)!;
  const original = Array.from(body.childNodes);
  native.mockImplementation(() =>
    expect(body.lastElementChild?.tagName).toBe('IMG'),
  );
  input.click();
  send.click();
  await flush();
  expect(create).toHaveBeenCalledExactlyOnceWith({
    recipient: 'first@example.com',
    subject: 'Test subject',
  });
  expect(native).toHaveBeenCalledOnce();
  expect(Array.from(body.childNodes).slice(0, -1)).toEqual(original);
  const pixel = body.querySelector('img')!;
  expect(pixel.width).toBe(1);
  expect(pixel.height).toBe(1);
  expect(pixel.alt).toBe('');
  expect(pixel.getAttribute('aria-hidden')).toBe('true');
  expect(pixel.style.display).not.toBe('none');
  send.click();
  await flush();
  expect(body.querySelectorAll('img[data-email-tracker-id]')).toHaveLength(1);
  expect(body.querySelector('img')).toBe(pixel);
  expect(create).toHaveBeenCalledOnce();
});
it('permits empty subject and typed recipient when chips are absent', async () => {
  const node = fixture();
  node
    .querySelectorAll('div:first-child > span')
    .forEach((chip) => chip.remove());
  node.querySelector<HTMLInputElement>('[aria-label="To"]')!.value =
    'Typed <typed@example.com>; second@example.com';
  node.querySelector<HTMLInputElement>('[aria-label="Subject"]')!.value = '';
  const { input, send, create } = setup(node);
  input.click();
  send.click();
  await flush();
  expect(create).toHaveBeenCalledExactlyOnceWith({
    recipient: 'typed@example.com',
    subject: '',
  });
});
it('never uses Cc, quoted content or another compose recipient', async () => {
  const node = fixture();
  node.firstElementChild!.remove();
  node.insertAdjacentHTML(
    'afterbegin',
    '<div><span title="cc@example.com"></span><input aria-label="Cc"></div>',
  );
  outlookDom
    .findBody(node)
    ?.insertAdjacentHTML(
      'beforeend',
      '<input name="to" value="quoted@example.com">',
    );
  fixture();
  const { input, send, create, native, warning } = setup(node);
  input.click();
  send.click();
  await flush();
  expect(create).not.toHaveBeenCalled();
  expect(native).toHaveBeenCalledOnce();
  expect(warning).toHaveBeenCalledOnce();
});
it.each(['create', 'pixel', 'url', 'body'])(
  'failure %s resumes once with no pixel',
  async (failure) => {
    const { node, input, send, create, native, pixelWarning, warning } =
      setup();
    if (failure === 'create') create.mockRejectedValue(new Error('private'));
    if (failure === 'url')
      create.mockResolvedValue({
        ...result,
        trackingUrl: 'http://bad.test/o/id',
      });
    if (failure === 'body') outlookDom.findBody(node)!.remove();
    if (failure === 'pixel')
      vi.spyOn(outlookDom.findBody(node)!, 'appendChild').mockImplementation(
        () => {
          throw new Error('DOM failure');
        },
      );
    input.click();
    send.click();
    await flush();
    expect(native).toHaveBeenCalledOnce();
    expect(node.querySelector('[data-email-tracker-id]')).toBeNull();
    expect(
      failure === 'create' ? warning : pixelWarning,
    ).toHaveBeenCalledOnce();
  },
);
it('mixed keyboard/click repeats and recursion create one tracking and resume once', async () => {
  const { node, input, send, create, native } = setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  input.click();
  const event = key(outlookDom.findBody(node)!, {
    key: 'Enter',
    ctrlKey: true,
  });
  key(outlookDom.findBody(node)!, {
    key: 'Enter',
    ctrlKey: true,
    repeat: true,
  });
  send.click();
  await flush();
  expect(event.defaultPrevented).toBe(true);
  expect(create).toHaveBeenCalledOnce();
  expect(native).not.toHaveBeenCalled();
  pending.resolve(result);
  await flush();
  expect(native).toHaveBeenCalledOnce();
});
it.each(['Enter', ' '])(
  'intercepts button keyboard activation %s',
  async (value) => {
    const { input, send, create, native } = setup();
    input.click();
    key(send, { key: value });
    await flush();
    expect(create).toHaveBeenCalledOnce();
    expect(native).toHaveBeenCalledOnce();
  },
);
it('does not block other shortcuts or unadvertised send shortcuts', () => {
  const { node, input, send, create } = setup();
  input.click();
  for (const init of [
    { key: 'Enter' },
    { key: 's', ctrlKey: true },
    { key: 'Enter', altKey: true },
    { key: 'Enter', ctrlKey: true, shiftKey: true },
  ]) {
    expect(key(outlookDom.findBody(node)!, init).defaultPrevented).toBe(false);
  }
  send.setAttribute('aria-label', 'Send');
  expect(
    key(outlookDom.findBody(node)!, { key: 'Enter', ctrlKey: true })
      .defaultPrevented,
  ).toBe(false);
  expect(create).not.toHaveBeenCalled();
});
it('bounds a stalled request at the shared 20s timeout and ignores late success', async () => {
  vi.useFakeTimers();
  const { node, input, send, create, native } = setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  input.click();
  send.click();
  await flush();
  await vi.advanceTimersByTimeAsync(19999);
  expect(native).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(native).toHaveBeenCalledOnce();
  pending.resolve(result);
  await flush();
  expect(native).toHaveBeenCalledOnce();
  expect(node.querySelector('[data-email-tracker-id]')).toBeNull();
});
it('concurrent compose sends have independent state and results', async () => {
  const firstNode = fixture();
  const secondNode = fixture();
  secondNode
    .querySelector('[title]')!
    .setAttribute('title', 'other@example.com');
  const first = setup(firstNode);
  const second = setup(secondNode);
  // Both controllers share per-compose locks, regardless of which captures first.
  first.input.click();
  second.input.click();
  first.send.click();
  second.send.click();
  await flush();
  expect(first.create.mock.calls.map((call) => call[0].recipient)).toEqual([
    'first@example.com',
    'other@example.com',
  ]);
  expect(first.native).toHaveBeenCalledOnce();
  expect(second.native).toHaveBeenCalledOnce();
  expect(firstNode.querySelectorAll('[data-email-tracker-id]')).toHaveLength(1);
  expect(secondNode.querySelectorAll('[data-email-tracker-id]')).toHaveLength(
    1,
  );
});
it('closed compose is not sent after request resolves', async () => {
  const { node, input, send, create, native } = setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  input.click();
  send.click();
  node.remove();
  pending.resolve(result);
  await flush();
  expect(native).not.toHaveBeenCalled();
});
it('reacquires a replaced send button while waiting', async () => {
  const { input, send, create, native } = setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  input.click();
  send.click();
  const replacement = send.cloneNode(true) as HTMLElement;
  send.replaceWith(replacement);
  const resumed = vi.fn();
  replacement.addEventListener('click', resumed);
  pending.resolve(result);
  await flush();
  expect(resumed).toHaveBeenCalledOnce();
  expect(native).not.toHaveBeenCalled();
});
it.each(['success', 'storage failure', 'create failure', 'OFF'])(
  'shared history remains functional: %s',
  async (scenario) => {
    const { input, send, create, native } = setup();
    const backend = vi.fn().mockResolvedValue(result);
    const add = vi.fn().mockResolvedValue(undefined);
    if (scenario === 'storage failure')
      add.mockRejectedValue(new Error('quota'));
    if (scenario === 'create failure')
      backend.mockRejectedValue(new Error('offline'));
    create.mockImplementation(createTrackingRecorder(backend, add, vi.fn()));
    if (scenario !== 'OFF') input.click();
    send.click();
    await flush();
    expect(native).toHaveBeenCalledOnce();
    if (scenario === 'success' || scenario === 'storage failure')
      expect(add).toHaveBeenCalledExactlyOnceWith({
        trackingId: result.trackingId,
        createdAt: result.createdAt,
        recipient: 'first@example.com',
        subject: 'Test subject',
      });
    else expect(add).not.toHaveBeenCalled();
  },
);

it('recognizes a Send icon without localized text and ignores scheduled-send actions', () => {
  const node = fixture();
  const send = node.querySelector('button')!;
  send.removeAttribute('aria-label');
  send.innerHTML = '<i data-icon-name="Send"></i>';
  node
    .querySelector('footer')!
    .insertAdjacentHTML(
      'afterbegin',
      '<button aria-label="Schedule send">Schedule send</button>',
    );
  adapter();
  expect(outlookDom.findSend(node)).toBe(send);
  expect(toggle(node).checked).toBe(false);
});

it('does not borrow Send or recipient from an unrelated nested dialog', () => {
  const node = fixture();
  node.querySelector('footer')!.remove();
  node.insertAdjacentHTML(
    'beforeend',
    '<div role="dialog"><input name="to" value="other@example.com"><footer><button>Send</button></footer></div>',
  );
  const { detected } = adapter();
  expect(detected).not.toHaveBeenCalled();
});

it('inline reply with no editable headers gets a toggle and falls back without guessing recipient', async () => {
  const node = fixture();
  node.removeAttribute('role');
  node.firstElementChild!.remove();
  node.querySelector('[aria-label="Subject"]')!.remove();
  const { input, send, create, native } = setup(node);
  input.click();
  send.click();
  await flush();
  expect(create).not.toHaveBeenCalled();
  expect(native).toHaveBeenCalledOnce();
});

it('headers arriving after the body and actions remain in the detected dialog scope', async () => {
  const node = fixture();
  const to = node.firstElementChild!;
  const subject = node.querySelector('[aria-label="Subject"]')!;
  to.remove();
  subject.remove();
  const wrapper = document.createElement('div');
  wrapper.append(...node.childNodes);
  node.append(wrapper);
  const { detected } = adapter();
  node.prepend(to, subject);
  await mutations();
  expect(detected).toHaveBeenCalledExactlyOnceWith(node);
  expect(outlookDom.readMetadata(node)?.recipient).toBe('first@example.com');
});

it('OFF removes an earlier pixel and metadata changes remove stale tracking before failure', async () => {
  const { node, input, send, create, native } = setup();
  input.click();
  send.click();
  await flush();
  input.click();
  send.click();
  expect(node.querySelector('[data-email-tracker-id]')).toBeNull();
  input.click();
  send.click();
  await flush();
  expect(create).toHaveBeenCalledOnce();
  node.querySelector<HTMLInputElement>('[aria-label="Subject"]')!.value =
    'Changed';
  create.mockRejectedValue(new Error('offline'));
  send.click();
  await flush();
  expect(node.querySelector('[data-email-tracker-id]')).toBeNull();
  expect(native).toHaveBeenCalledTimes(4);
});

it('editing metadata or switching OFF during the request prevents stale pixel insertion', async () => {
  const { node, input, send, create, native } = setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  input.click();
  send.click();
  node.querySelector<HTMLInputElement>('[aria-label="Subject"]')!.value =
    'Changed';
  input.click();
  send.click();
  pending.resolve(result);
  await flush();
  expect(native).toHaveBeenCalledOnce();
  expect(node.querySelector('[data-email-tracker-id]')).toBeNull();
});

it('stop while a request is pending still releases the intercepted native send', async () => {
  const { input, send, create, native, controller } = setup();
  const pending = deferred();
  create.mockReturnValue(pending.promise);
  input.click();
  send.click();
  controller.stop();
  pending.resolve(result);
  await flush();
  expect(native).toHaveBeenCalledOnce();
  send.click();
  expect(native).toHaveBeenCalledTimes(2);
  expect(create).toHaveBeenCalledOnce();
});

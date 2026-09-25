import '../__tests__/dom.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GmailAdapter } from './GmailAdapter.js';

// Solo señales estructurales; ningún texto, clase generada o dato de correo.
function compose(): HTMLElement {
  const node = document.createElement('section');
  node.setAttribute('role', 'dialog');
  node.innerHTML =
    '<input name="subjectbox"><div role="textbox" contenteditable="true"></div>' +
    '<table><tbody><tr><td><div role="group"><div role="button" tabindex="0" data-tooltip="Enviar (Ctrl-Enter)">Enviar</div><div role="button" aria-label="Más opciones de envío"></div></div></td></tr></tbody></table>';
  return node;
}

function toggleInput(node: HTMLElement): HTMLInputElement {
  return node
    .querySelector('.email-tracker-toggle')!
    .shadowRoot!.querySelector<HTMLInputElement>('input')!;
}

async function mutations(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('GmailAdapter', () => {
  let adapter: GmailAdapter;
  let detected: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.replaceChildren();
    detected = vi.fn();
    adapter = new GmailAdapter(document, detected);
  });
  afterEach(() => adapter.stop());

  it('recognizes Gmail over HTTPS', () => {
    expect(
      adapter.canHandle(new URL('https://mail.google.com/mail/u/0/')),
    ).toBe(true);
  });

  it.each([
    'https://outlook.office.com',
    'https://outlook.live.com',
    'https://mail.google.com.example.org',
    'https://google.com',
    'http://mail.google.com',
  ])('rejects %s', (url) => {
    expect(adapter.canHandle(new URL(url))).toBe(false);
  });

  it('detects an existing compose without modifying native controls or the email', () => {
    const node = compose();
    document.body.append(node);
    const editor = node.querySelector('[contenteditable]')!;
    const subject = node.querySelector('input')!;
    const sendGroup = node.querySelector('[role="group"]')!;
    const originals = [editor, subject, sendGroup].map(
      (element) => element.outerHTML,
    );
    adapter.start();
    expect(detected).toHaveBeenCalledExactlyOnceWith(node);
    expect(
      [editor, subject, sendGroup].map((element) => element.outerHTML),
    ).toEqual(originals);
  });

  it('detects a compose added inside a wrapper after starting', async () => {
    adapter.start();
    const wrapper = document.createElement('div');
    const node = compose();
    wrapper.append(node);
    document.body.append(wrapper);
    await mutations();
    expect(detected).toHaveBeenCalledExactlyOnceWith(node);
  });

  it('does not repeat notifications while editing or moving a compose', async () => {
    const node = compose();
    document.body.append(node);
    adapter.start();
    adapter.start();
    node.querySelector('[contenteditable]')!.textContent = 'Draft';
    document.body.append(node);
    await mutations();
    expect(detected).toHaveBeenCalledTimes(1);
  });

  it('detects two simultaneous compose windows independently', async () => {
    adapter.start();
    const first = compose();
    const second = compose();
    document.body.append(first, second);
    await mutations();
    expect(detected.mock.calls).toEqual([[first], [second]]);
  });

  it('detects a new window after closing the previous one', async () => {
    adapter.start();
    const first = compose();
    document.body.append(first);
    await mutations();
    first.remove();
    await mutations();
    const second = compose();
    document.body.append(second);
    await mutations();
    expect(detected.mock.calls).toEqual([[first], [second]]);
  });

  it('stops pending and future notifications', async () => {
    adapter.start();
    document.body.append(compose());
    adapter.stop();
    adapter.stop();
    document.body.append(compose());
    await mutations();
    expect(detected).not.toHaveBeenCalled();
  });

  it('can restart without notifying previously detected windows', () => {
    document.body.append(compose());
    adapter.start();
    adapter.stop();
    const second = compose();
    document.body.append(second);
    adapter.start();
    expect(detected).toHaveBeenCalledTimes(2);
    expect(detected).toHaveBeenLastCalledWith(second);
  });

  it('ignores unrelated changes, generic dialogs and inline editors', async () => {
    adapter.start();
    document.body.innerHTML =
      '<nav>Inbox</nav><div role="dialog"><input></div><div role="textbox" contenteditable="true"></div>';
    await mutations();
    document.querySelector('nav')!.textContent = 'Updated';
    await mutations();
    expect(detected).not.toHaveBeenCalled();
  });

  it('waits for incrementally inserted compose controls', async () => {
    const node = document.createElement('div');
    node.setAttribute('role', 'dialog');
    document.body.append(node);
    adapter.start();
    node.innerHTML = '<input name="subjectbox">';
    await mutations();
    expect(detected).not.toHaveBeenCalled();
    node.insertAdjacentHTML(
      'beforeend',
      '<div role="textbox" contenteditable="true"></div>',
    );
    await mutations();
    expect(detected).toHaveBeenCalledExactlyOnceWith(node);
  });

  it('detects semantic attributes assigned after insertion', async () => {
    const node = compose();
    node.removeAttribute('role');
    node.querySelector('input')!.removeAttribute('name');
    node.querySelector('div')!.setAttribute('contenteditable', 'false');
    document.body.append(node);
    adapter.start();
    node.setAttribute('role', 'dialog');
    node.querySelector('input')!.setAttribute('name', 'subjectbox');
    node.querySelector('div')!.setAttribute('contenteditable', 'true');
    await mutations();
    expect(detected).toHaveBeenCalledExactlyOnceWith(node);
  });

  it('does not identify an outer dialog using nested dialog controls', () => {
    const outer = document.createElement('div');
    outer.setAttribute('role', 'dialog');
    const inner = compose();
    outer.append(inner);
    document.body.append(outer);
    adapter.start();
    expect(detected).toHaveBeenCalledExactlyOnceWith(inner);
  });

  it('ignores compose removed before mutation delivery', async () => {
    adapter.start();
    const node = compose();
    document.body.append(node);
    node.remove();
    await mutations();
    expect(detected).not.toHaveBeenCalled();
  });

  it('continues observing if a consumer throws', async () => {
    detected.mockImplementation(() => {
      throw new Error('Consumer failed');
    });
    document.body.append(compose());
    expect(() => adapter.start()).not.toThrow();
    document.body.append(compose());
    await mutations();
    expect(detected).toHaveBeenCalledTimes(2);
  });

  it('adds an OFF control beside Send in an existing compose', () => {
    const node = compose();
    document.body.append(node);
    adapter.start();
    expect(toggleInput(node).checked).toBe(false);
    expect(node.querySelector('.email-tracker-toggle')!.parentElement).toBe(
      node.querySelector('td'),
    );
    expect(
      node
        .querySelector('[role="group"]')!
        .querySelector('.email-tracker-toggle'),
    ).toBeNull();
  });

  it('adds a control to dynamically inserted compose', async () => {
    adapter.start();
    const node = compose();
    document.body.append(node);
    await mutations();
    expect(toggleInput(node).checked).toBe(false);
  });

  it('keeps compose states independent with one control each', async () => {
    const first = compose();
    document.body.append(first);
    adapter.start();
    toggleInput(first).click();
    const second = compose();
    document.body.append(second);
    await mutations();
    expect(toggleInput(first).checked).toBe(true);
    expect(toggleInput(second).checked).toBe(false);
    expect(document.querySelectorAll('.email-tracker-toggle')).toHaveLength(2);
  });

  it('never duplicates controls during edits, attachments, repeated start or another adapter', async () => {
    const node = compose();
    document.body.append(node);
    adapter.start();
    adapter.start();
    toggleInput(node).click();
    const secondAdapter = new GmailAdapter(document, vi.fn());
    try {
      secondAdapter.start();
      node.querySelector('[contenteditable]')!.textContent = 'Draft';
      node.querySelector('input')!.value = 'Subject';
      node.append(document.createElement('aside'));
      node.querySelector('td')!.append(document.createElement('span'));
      await mutations();
      expect(node.querySelectorAll('.email-tracker-toggle')).toHaveLength(1);
      expect(toggleInput(node).checked).toBe(true);
      expect(detected).toHaveBeenCalledTimes(1);
    } finally {
      secondAdapter.stop();
    }
  });

  it('waits for actions added after compose detection', async () => {
    const node = compose();
    const actions = node.querySelector('table')!;
    actions.remove();
    document.body.append(node);
    adapter.start();
    expect(node.querySelector('.email-tracker-toggle')).toBeNull();
    node.append(actions);
    await mutations();
    expect(toggleInput(node).checked).toBe(false);
    expect(detected).toHaveBeenCalledTimes(1);
  });

  it('waits for Send attributes populated later', async () => {
    const node = compose();
    const send = node.querySelector('[data-tooltip]')!;
    send.removeAttribute('data-tooltip');
    document.body.append(node);
    adapter.start();
    expect(node.querySelector('.email-tracker-toggle')).toBeNull();
    send.setAttribute('aria-label', 'Enviar');
    await mutations();
    expect(toggleInput(node).checked).toBe(false);
  });

  it('reattaches the same ON control after Gmail rebuilds its actions', async () => {
    const node = compose();
    document.body.append(node);
    adapter.start();
    const original = toggleInput(node);
    original.click();
    node.querySelector('table')!.replaceWith(compose().querySelector('table')!);
    await mutations();
    expect(toggleInput(node)).toBe(original);
    expect(original.checked).toBe(true);
    expect(node.querySelectorAll('.email-tracker-toggle')).toHaveLength(1);
  });

  it('restores a removed control once without losing its state', async () => {
    const node = compose();
    document.body.append(node);
    adapter.start();
    toggleInput(node).click();
    node.querySelector('.email-tracker-toggle')!.remove();
    await mutations();
    expect(node.querySelectorAll('.email-tracker-toggle')).toHaveLength(1);
    expect(toggleInput(node).checked).toBe(true);
    expect(detected).toHaveBeenCalledTimes(1);
  });

  it('handles removal and starts a new compose OFF', async () => {
    const first = compose();
    document.body.append(first);
    adapter.start();
    toggleInput(first).click();
    first.remove();
    await mutations();
    const second = compose();
    document.body.append(second);
    await mutations();
    expect(toggleInput(second).checked).toBe(false);
    expect(document.querySelectorAll('.email-tracker-toggle')).toHaveLength(1);
  });

  it('does not guess insertion from visible text alone', () => {
    const node = compose();
    node.querySelector('[data-tooltip]')!.removeAttribute('data-tooltip');
    document.body.append(node);
    adapter.start();
    expect(node.querySelector('.email-tracker-toggle')).toBeNull();
  });

  it.each(['Send', 'Enviar', 'Senden (Ctrl-Enter)', '送信（⌘Enter）'])(
    'supports action metadata %s',
    (label) => {
      const node = compose();
      const send = node.querySelector('[data-tooltip]')!;
      send.removeAttribute('data-tooltip');
      send.setAttribute('aria-label', label);
      document.body.append(node);
      adapter.start();
      expect(toggleInput(node).checked).toBe(false);
    },
  );

  it('inserts after a Send group outside table layouts', () => {
    const node = compose();
    node.querySelector('table')!.remove();
    const actions = document.createElement('footer');
    actions.innerHTML =
      '<div role="group"><button aria-label="Send">Send</button><button>Options</button></div>';
    node.append(actions);
    document.body.append(node);
    adapter.start();
    expect(actions.firstElementChild!.nextElementSibling).toBe(
      node.querySelector('.email-tracker-toggle'),
    );
  });

  it('never inserts in an editor or borrows a nested dialog action', () => {
    const node = compose();
    node.querySelector('table')!.remove();
    node.querySelector('[contenteditable]')!.innerHTML =
      '<div><button aria-label="Send">Quoted content</button></div>';
    node.insertAdjacentHTML(
      'beforeend',
      '<div role="dialog"><footer><button aria-label="Send">Send</button></footer></div>',
    );
    const original = node.innerHTML;
    document.body.append(node);
    adapter.start();
    expect(node.innerHTML).toBe(original);
  });

  it('preserves native Send click behavior when tracking is switched back OFF', () => {
    const node = compose();
    const send = node.querySelector<HTMLElement>('[data-tooltip]')!;
    const clicked = vi.fn();
    send.addEventListener('click', clicked);
    document.body.append(node);
    adapter.start();
    toggleInput(node).click();
    expect(clicked).not.toHaveBeenCalled();
    toggleInput(node).click();
    send.click();
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('does not attach new controls after stop', async () => {
    adapter.start();
    adapter.stop();
    const node = compose();
    document.body.append(node);
    await mutations();
    expect(node.querySelector('.email-tracker-toggle')).toBeNull();
  });
});

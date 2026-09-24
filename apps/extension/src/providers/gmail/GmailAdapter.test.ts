import '../__tests__/dom.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GmailAdapter } from './GmailAdapter.js';

// Solo señales estructurales; ningún texto, clase generada o dato de correo.
function compose(): HTMLElement {
  const node = document.createElement('section');
  node.setAttribute('role', 'dialog');
  node.innerHTML =
    '<input name="subjectbox"><div role="textbox" contenteditable="true"></div>';
  return node;
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

  it('detects an existing compose without modifying its DOM', () => {
    const node = compose();
    document.body.append(node);
    const original = document.body.innerHTML;
    adapter.start();
    expect(detected).toHaveBeenCalledExactlyOnceWith(node);
    expect(document.body.innerHTML).toBe(original);
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
});

import '../__tests__/dom.js';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  GmailTrackingPixel,
  validateTrackingUrl,
} from './GmailTrackingPixel.js';

const tracking = {
  trackingId: '550e8400-e29b-41d4-a716-446655440000',
  trackingUrl:
    'https://tracking.example.com/o/550e8400-e29b-41d4-a716-446655440000?x=%2f',
  createdAt: '2026-09-25T10:00:00.000Z',
};
const injector = new GmailTrackingPixel();
function fixture() {
  const dialog = document.createElement('section');
  dialog.setAttribute('role', 'dialog');
  dialog.innerHTML =
    '<div role="textbox" contenteditable="true"><p>Hello <b>world</b></p><div class="signature"><a href="https://example.com">Signature</a><img src="https://example.com/logo.png"></div></div>';
  document.body.append(dialog);
  return dialog;
}
beforeEach(() => document.body.replaceChildren());
it.each([
  'http://example.com/o/id',
  'javascript:alert(1)',
  'data:image/png;base64,AA',
  'invalid',
  '/o/id',
  'https://example.com/api/id',
  'https://example.com/o/',
  'https://user:pass@example.com/o/id',
])('rejects %s without inserting', (url) => {
  expect(validateTrackingUrl(url)).toBe(false);
  const dialog = fixture();
  expect(injector.insert(dialog, { ...tracking, trackingUrl: url })).toBe(
    false,
  );
  expect(dialog.querySelector('[data-email-tracker-id]')).toBeNull();
});
it('accepts HTTPS /o/ and preserves the exact backend URL and required attributes', () => {
  const dialog = fixture();
  expect(validateTrackingUrl(tracking.trackingUrl)).toBe(true);
  expect(injector.insert(dialog, tracking)).toBe(true);
  const pixel = dialog.querySelector<HTMLImageElement>(
    '[data-email-tracker-id]',
  )!;
  expect(pixel.getAttribute('src')).toBe(tracking.trackingUrl);
  expect(pixel.getAttribute('width')).toBe('1');
  expect(pixel.getAttribute('height')).toBe('1');
  expect(pixel.alt).toBe('');
  expect(pixel.getAttribute('aria-hidden')).toBe('true');
  expect(pixel.dataset.emailTrackerId).toBe(tracking.trackingId);
  expect(pixel.style.display).toBe('');
  expect(pixel.style.position).toBe('');
  expect(pixel.style.opacity).toBe('0');
});
it('appends last preserving message, signature, images, links, node identity and handlers without innerHTML or input events', () => {
  const dialog = fixture();
  const body = dialog.querySelector<HTMLElement>('[contenteditable]')!;
  const nodes = Array.from(body.children);
  const markup = nodes.map((node) => node.outerHTML);
  const clicked = vi.fn();
  nodes[0].addEventListener('click', clicked);
  const input = vi.fn();
  body.addEventListener('input', input);
  const setter = vi.spyOn(body, 'innerHTML', 'set');
  expect(injector.insert(dialog, tracking)).toBe(true);
  expect(Array.from(body.children).slice(0, -1)).toEqual(nodes);
  expect(nodes.map((node) => node.outerHTML)).toEqual(markup);
  (nodes[0] as HTMLElement).click();
  expect(clicked).toHaveBeenCalledOnce();
  expect(body.lastElementChild?.getAttribute('data-email-tracker-id')).toBe(
    tracking.trackingId,
  );
  expect(setter).not.toHaveBeenCalled();
  expect(input).not.toHaveBeenCalled();
  setter.mockRestore();
});
it('deduplicates existing pixels, reuses the same node, and replaces stale tracking', () => {
  const dialog = fixture();
  injector.insert(dialog, tracking);
  const pixel = dialog.querySelector('[data-email-tracker-id]')!;
  pixel.after(pixel.cloneNode(true));
  expect(injector.insert(dialog, tracking)).toBe(true);
  expect(dialog.querySelectorAll('[data-email-tracker-id]')).toHaveLength(1);
  expect(dialog.querySelector('[data-email-tracker-id]')).toBe(pixel);
  expect(
    injector.insert(dialog, {
      ...tracking,
      trackingId: 'another',
      trackingUrl: 'https://example.com/o/another',
    }),
  ).toBe(true);
  expect(dialog.querySelectorAll('[data-email-tracker-id]')).toHaveLength(1);
  expect(dialog.contains(pixel)).toBe(false);
});
it('never selects the body or pixel of a nested or neighboring compose', () => {
  const outer = fixture();
  outer.querySelector('[contenteditable]')!.remove();
  const nested = fixture();
  outer.append(nested);
  const neighbor = fixture();
  injector.insert(nested, tracking);
  expect(injector.insert(outer, tracking)).toBe(false);
  expect(nested.querySelectorAll('[data-email-tracker-id]')).toHaveLength(1);
  expect(neighbor.querySelector('[data-email-tracker-id]')).toBeNull();
});
it('detects a silent failed append and rolls back an append that throws after insertion', () => {
  const dialog = fixture();
  const body = dialog.querySelector<HTMLElement>('[contenteditable]')!;
  const original = body.appendChild.bind(body);
  const spy = vi.spyOn(body, 'appendChild').mockImplementation((node) => node);
  expect(injector.insert(dialog, tracking)).toBe(false);
  spy.mockImplementation((node) => {
    original(node);
    throw new Error('after append');
  });
  expect(injector.insert(dialog, tracking)).toBe(false);
  expect(dialog.querySelector('[data-email-tracker-id]')).toBeNull();
  spy.mockRestore();
});

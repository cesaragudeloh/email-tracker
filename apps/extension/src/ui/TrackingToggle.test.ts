import '../providers/__tests__/dom.js';
import { beforeEach, expect, it, vi } from 'vitest';
import { createTrackingToggle, type TrackingToggle } from './TrackingToggle.js';

function input(toggle: TrackingToggle): HTMLInputElement {
  return toggle.element.shadowRoot!.querySelector<HTMLInputElement>('input')!;
}

beforeEach(() => document.body.replaceChildren());

it('starts OFF with a native checkbox', () => {
  const toggle = createTrackingToggle(document);
  expect(toggle.enabled).toBe(false);
  expect(input(toggle).checked).toBe(false);
  expect(input(toggle).type).toBe('checkbox');
});

it('switches ON and back OFF', () => {
  const toggle = createTrackingToggle(document);
  input(toggle).click();
  expect(toggle.enabled).toBe(true);
  input(toggle).click();
  expect(toggle.enabled).toBe(false);
});

it('notifies changes without emitting an initial change', () => {
  const changed = vi.fn();
  const toggle = createTrackingToggle(document, changed);
  document.body.append(toggle.element);
  expect(changed).not.toHaveBeenCalled();
  input(toggle).click();
  input(toggle).click();
  expect(changed.mock.calls).toEqual([[true], [false]]);
});

it('keeps two controls independent', () => {
  const first = createTrackingToggle(document);
  const second = createTrackingToggle(document);
  input(first).click();
  expect(first.enabled).toBe(true);
  expect(second.enabled).toBe(false);
  input(second).click();
  input(first).click();
  expect(first.enabled).toBe(false);
  expect(second.enabled).toBe(true);
});

it('associates its label and keeps the input keyboard focusable', () => {
  const toggle = createTrackingToggle(document);
  document.body.append(toggle.element);
  const label = toggle.element.shadowRoot!.querySelector('label')!;
  expect(label.textContent).toBe('Track email');
  expect(input(toggle).labels).toContain(label);
  expect(input(toggle).tabIndex).toBe(0);
  input(toggle).focus();
  expect(toggle.element.shadowRoot!.activeElement).toBe(input(toggle));
  label.click();
  expect(toggle.enabled).toBe(true);
});

it('isolates namespaced classes and styles inside the control', () => {
  const toggle = createTrackingToggle(document);
  expect(toggle.element.className).toBe('email-tracker-toggle');
  const shadow = toggle.element.shadowRoot!;
  for (const element of shadow.querySelectorAll('[class]')) {
    expect(
      Array.from(element.classList).every((name) =>
        name.startsWith('email-tracker-toggle__'),
      ),
    ).toBe(true);
  }
  const css = shadow.querySelector('style')!.textContent!;
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((match) =>
    match[1].trim(),
  );
  expect(selectors.length).toBeGreaterThan(0);
  expect(
    selectors.every((selector) =>
      selector.startsWith('.email-tracker-toggle__'),
    ),
  ).toBe(true);
  expect(toggle.element.querySelector('style')).toBeNull();
});

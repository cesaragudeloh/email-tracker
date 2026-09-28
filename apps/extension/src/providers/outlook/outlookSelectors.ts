import { createTrackingRequestSchema } from '@email-tracker/shared';
import type { ComposeDom } from '../shared/composeDom.js';

// Outlook does not expose a public DOM contract. Keep heuristics here and
// fail open when a compose or recipient cannot be identified safely.
export const outlookSelectors = {
  compose: '[data-email-tracker-outlook-compose]',
  editor:
    '[contenteditable="true"][role="textbox"][aria-multiline="true"], [contenteditable="true"][aria-label^="Message body"], [contenteditable="true"][aria-label^="Cuerpo del mensaje"]',
  editable: '[contenteditable="true"]',
  action: 'button, [role="button"]',
  sendIcon: '[data-icon-name="Send"]',
  subject:
    'input[name="subject"], input[aria-label="Subject"], input[aria-label="Asunto"], input[placeholder="Add a subject"], input[placeholder="Agregar un asunto"]',
  to: '[data-recipient-type="to"], [aria-label="To"], [aria-label="Para"], input[name="to"]',
  chip: '[email], [data-email-address], [title], [aria-label]',
  quoted: 'blockquote, [id="divRplyFwdMsg"]',
  unsafePlacement:
    'button, [role="button"], [contenteditable="true"], input, [role="textbox"]',
};

export const outlookObservedAttributes = [
  'role',
  'contenteditable',
  'aria-multiline',
  'aria-label',
  'aria-keyshortcuts',
  'title',
  'name',
  'placeholder',
  'data-recipient-type',
  'data-icon-name',
];

const label = (value: string | null) =>
  (value ?? '').replace(/\p{Cf}/gu, '').trim();
const shortcut = /(?:Ctrl|Control|⌘|Command|Cmd)\s*[-+]?\s*(?:Enter|Return)/i;

function outsideEditor(node: Element): boolean {
  return (
    !node.closest(outlookSelectors.editable) &&
    !node.closest(outlookSelectors.quoted)
  );
}

function sendCandidates(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(outlookSelectors.action),
  ).filter((node) => {
    if (
      !outsideEditor(node) ||
      node.closest('[role="dialog"]') !== root.closest('[role="dialog"]')
    )
      return false;
    return (
      [
        node.getAttribute('aria-label'),
        node.getAttribute('title'),
        node.getAttribute('aria-keyshortcuts'),
      ].some(
        (value) =>
          shortcut.test(label(value)) ||
          /^(Send|Enviar)(?:\s*\([^)]*\))?$/i.test(label(value)),
      ) ||
      /^(Send|Enviar)$/i.test(label(node.textContent)) ||
      !!node.querySelector(outlookSelectors.sendIcon)
    );
  });
}

export function findOutlookCompose(
  editor: HTMLElement,
): HTMLElement | undefined {
  if (
    editor.parentElement?.closest(outlookSelectors.editable) ||
    editor.closest(outlookSelectors.quoted)
  )
    return;
  let fallback: HTMLElement | undefined;
  for (
    let parent = editor.parentElement;
    parent && parent !== editor.ownerDocument.body;
    parent = parent.parentElement
  ) {
    if (parent.matches('main, [role="main"]')) break;
    const editors = parent.querySelectorAll(outlookSelectors.editor);
    if (editors.length !== 1) break;
    if (!sendCandidates(parent).length) continue;
    fallback ??= parent;
    // Prefer the ancestor containing headers as well as the body/actions.
    if (
      Array.from(
        parent.querySelectorAll(
          `${outlookSelectors.subject}, ${outlookSelectors.to}`,
        ),
      ).some(outsideEditor)
    )
      return parent;
    if (parent.matches('[role="dialog"], form')) {
      fallback = parent;
      break;
    }
  }
  // Inline replies may have no editable headers; metadata then fails open.
  return fallback;
}

const owned = (compose: HTMLElement, node: Element) =>
  node.closest(outlookSelectors.compose) === compose &&
  outsideEditor(node) &&
  node.closest('[role="dialog"]') === compose.closest('[role="dialog"]');

function readMetadata(compose: HTMLElement) {
  const subject =
    Array.from(
      compose.querySelectorAll<HTMLInputElement>(outlookSelectors.subject),
    ).find((node) => owned(compose, node))?.value ?? '';
  const candidates: string[] = [];
  for (const region of compose.querySelectorAll<HTMLElement>(
    outlookSelectors.to,
  )) {
    if (!owned(compose, region)) continue;
    // Outlook's input and committed recipient tokens share a picker container.
    const container = region.matches('input, [role="combobox"]')
      ? region.parentElement
      : region;
    if (!container || container === compose) continue;
    for (const chip of container.querySelectorAll(outlookSelectors.chip)) {
      if (!owned(compose, chip) || chip.matches('input')) continue;
      for (const attr of ['email', 'data-email-address', 'title', 'aria-label'])
        candidates.push(chip.getAttribute(attr) ?? '');
    }
    if (region.matches('input'))
      candidates.push((region as HTMLInputElement).value);
  }
  for (const candidate of candidates) {
    for (const part of candidate.split(/[,;]+/)) {
      const recipient = (/<([^<>]+)>/.exec(part)?.[1] ?? part).trim();
      const parsed = createTrackingRequestSchema.safeParse({
        recipient,
        subject,
      });
      if (parsed.success) return parsed.data;
    }
  }
}

export const outlookDom: ComposeDom = {
  findCompose: (node) => node.closest<HTMLElement>(outlookSelectors.compose),
  findBody: (compose) =>
    Array.from(
      compose.querySelectorAll<HTMLElement>(outlookSelectors.editor),
    ).find(
      (node) =>
        node.closest(outlookSelectors.compose) === compose &&
        !node.closest(outlookSelectors.quoted),
    ),
  findSend: (compose) =>
    sendCandidates(compose).find((node) => owned(compose, node)),
  readMetadata,
  findTogglePlacement: (compose) => {
    const send = outlookDom.findSend(compose);
    const parent = send?.parentElement;
    if (
      !send ||
      !parent ||
      parent === compose ||
      parent.closest(outlookSelectors.unsafePlacement) ||
      parent.querySelector(outlookSelectors.editor)
    )
      return;
    return { parent, after: send };
  },
  isSendShortcut: (key, send) => {
    if (key.key !== 'Enter') return false;
    const advertised = [
      send.getAttribute('aria-keyshortcuts'),
      send.getAttribute('aria-label'),
      send.getAttribute('title'),
    ]
      .map(label)
      .join(' ');
    return (
      (key.ctrlKey &&
        /(?:Ctrl|Control)\s*[-+]?\s*(?:Enter|Return)/i.test(advertised)) ||
      (key.metaKey &&
        /(?:⌘|Command|Cmd|Meta)\s*[-+]?\s*(?:Enter|Return)/i.test(advertised))
    );
  },
};

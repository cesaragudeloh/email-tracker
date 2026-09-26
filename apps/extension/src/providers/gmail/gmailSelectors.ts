import {
  createTrackingRequestSchema,
  type CreateTrackingRequest,
} from '@email-tracker/shared';
// Gmail no publica un contrato DOM: mantener estas estrategias juntas.
// La detección de compose no depende de etiquetas traducidas.
export const gmailSelectors = {
  dialog: '[role="dialog"]',
  trackingPixel: 'img[data-email-tracker-id]',
  subject: 'input[name="subjectbox"]',
  toInput: 'input[name="to"], textarea[name="to"]',
  toRegion: '[data-name="to"], [data-recipient-type="to"]',
  recipientChip: '[email], [data-hovercard-id]',
  recipientRow: 'tr, [role="row"]',
  disabled: '[disabled], [aria-disabled="true"]',
  editor: '[role="textbox"][contenteditable="true"]',
  action:
    '[role="button"][data-tooltip], button[data-tooltip], [role="button"][aria-label], button[aria-label]',
  group: '[role="group"]',
  cell: 'td',
  editable: '[contenteditable="true"]',
  unsafeInsertion:
    '[contenteditable="true"], [role="button"], button, [role="textbox"]',
};

export const gmailObservedAttributes = [
  'role',
  'name',
  'contenteditable',
  'aria-label',
  'data-tooltip',
];

export interface GmailTogglePlacement {
  parent: HTMLElement;
  after: Element | null;
}

export function findGmailSendButton(
  dialog: HTMLElement,
): HTMLElement | undefined {
  const actions = Array.from(
    dialog.querySelectorAll<HTMLElement>(gmailSelectors.action),
  ).filter(
    (action) =>
      action.closest(gmailSelectors.dialog) === dialog &&
      !action.closest(gmailSelectors.editable),
  );
  const values = (action: HTMLElement) =>
    [
      action.getAttribute('data-tooltip'),
      action.getAttribute('aria-label'),
    ].map((value) => (value ?? '').replace(/\p{Cf}/gu, '').trim());
  // El atajo evita depender del idioma del texto. Gmail puede cambiar su formato.
  const shortcut = /(?:Ctrl|Control|⌘|Command|Cmd)\s*[-+]?\s*(?:Enter|Return)/i;
  const send =
    actions.find((action) =>
      values(action).some((value) => shortcut.test(value)),
    ) ??
    // Fallback limitado y deliberado: no adivinar por posición ni texto visible.
    actions.find((action) =>
      values(action).some((value) =>
        /^(?:Send|Enviar)(?:\s*\([^)]*\))?$/i.test(value),
      ),
    );
  return send;
}

export function findGmailTogglePlacement(
  dialog: HTMLElement,
): GmailTogglePlacement | undefined {
  const send = findGmailSendButton(dialog);
  if (!send) return;
  const cell = send.closest<HTMLElement>(gmailSelectors.cell);
  const group = send.closest<HTMLElement>(gmailSelectors.group);
  const anchor =
    group && group.closest(gmailSelectors.dialog) === dialog ? group : send;
  const parent =
    cell && cell.closest(gmailSelectors.dialog) === dialog
      ? cell
      : anchor.parentElement;
  if (
    !parent ||
    parent === dialog ||
    parent.closest(gmailSelectors.unsafeInsertion) ||
    parent.querySelector(gmailSelectors.editor) ||
    ['TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR'].includes(parent.tagName)
  )
    return;
  return { parent, after: parent === cell ? null : anchor };
}

export function isGmailCompose(dialog: HTMLElement): boolean {
  // subjectbox es un nombre interno de Gmail y puede cambiar. Exigir ambos
  // controles evita confundir otros diálogos y respuestas inline con compose.
  return [gmailSelectors.subject, gmailSelectors.editor].every((selector) =>
    Array.from(dialog.querySelectorAll(selector)).some(
      (control) => control.closest(gmailSelectors.dialog) === dialog,
    ),
  );
}

function ownedBy(dialog: HTMLElement, node: Element): boolean {
  return (
    node.closest(gmailSelectors.dialog) === dialog &&
    !node.closest(gmailSelectors.editable)
  );
}

export function readGmailMetadata(
  dialog: HTMLElement,
): CreateTrackingRequest | undefined {
  const inputs = Array.from(
    dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      gmailSelectors.toInput,
    ),
  ).filter((node) => ownedBy(dialog, node));
  const regions = new Set<Element>(
    Array.from(dialog.querySelectorAll(gmailSelectors.toRegion)).filter(
      (node) => ownedBy(dialog, node),
    ),
  );
  for (const input of inputs) {
    const row = input.closest(gmailSelectors.recipientRow);
    if (row && ownedBy(dialog, row)) regions.add(row);
  }
  const candidates: string[] = [];
  for (const region of regions) {
    for (const chip of region.querySelectorAll(gmailSelectors.recipientChip)) {
      if (ownedBy(dialog, chip))
        candidates.push(
          chip.getAttribute('email') ??
            chip.getAttribute('data-hovercard-id') ??
            '',
        );
    }
  }
  candidates.push(...inputs.map((input) => input.value));
  const subject =
    Array.from(
      dialog.querySelectorAll<HTMLInputElement>(gmailSelectors.subject),
    ).find((node) => ownedBy(dialog, node))?.value ?? '';
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
  return undefined;
}

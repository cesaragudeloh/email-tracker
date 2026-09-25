// Gmail no publica un contrato DOM: mantener estas estrategias juntas.
// La detección de compose no depende de etiquetas traducidas.
export const gmailSelectors = {
  dialog: '[role="dialog"]',
  subject: 'input[name="subjectbox"]',
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

export function findGmailTogglePlacement(
  dialog: HTMLElement,
): GmailTogglePlacement | undefined {
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

// Gmail no publica un contrato DOM: mantener estas estrategias juntas.
// No usamos aria-label porque cambia con el idioma de la cuenta.
export const gmailSelectors = {
  dialog: '[role="dialog"]',
  subject: 'input[name="subjectbox"]',
  editor: '[role="textbox"][contenteditable="true"]',
};

export const gmailObservedAttributes = ['role', 'name', 'contenteditable'];

export function isGmailCompose(dialog: HTMLElement): boolean {
  // subjectbox es un nombre interno de Gmail y puede cambiar. Exigir ambos
  // controles evita confundir otros diálogos y respuestas inline con compose.
  return [gmailSelectors.subject, gmailSelectors.editor].every((selector) =>
    Array.from(dialog.querySelectorAll(selector)).some(
      (control) => control.closest(gmailSelectors.dialog) === dialog,
    ),
  );
}

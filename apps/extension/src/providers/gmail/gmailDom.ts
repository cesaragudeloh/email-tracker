import type { ComposeDom } from '../shared/composeDom.js';
import {
  gmailSelectors,
  findGmailSendButton,
  findGmailTogglePlacement,
  readGmailMetadata,
} from './gmailSelectors.js';

export const gmailDom: ComposeDom = {
  findCompose: (node) => node.closest<HTMLElement>(gmailSelectors.dialog),
  findBody: (compose) =>
    Array.from(
      compose.querySelectorAll<HTMLElement>(gmailSelectors.editor),
    ).find((node) => node.closest(gmailSelectors.dialog) === compose),
  findSend: findGmailSendButton,
  findTogglePlacement: findGmailTogglePlacement,
  readMetadata: readGmailMetadata,
  isSendShortcut: (key) => key.key === 'Enter' && (key.ctrlKey || key.metaKey),
};

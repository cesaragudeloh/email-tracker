import './popup.css';
import { config } from '../config.js';
import { createApiClient } from '../api/client.js';
import { createActivationStorage } from '../activation/storage.js';
import { createActivationService } from '../activation/activationService.js';
import { activationErrorMessage } from './messages.js';

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error('Popup markup is incomplete');
  return result;
}

const status = element<HTMLElement>('#activation-status');
const form = element<HTMLFormElement>('#activation-form');
const code = element<HTMLInputElement>('#activation-code');
const button = element<HTMLButtonElement>('#activate-button');
const message = element<HTMLElement>('#activation-message');
const installation = element<HTMLElement>('#installation-id');
const service = createActivationService(
  createActivationStorage(),
  createApiClient(config.apiBaseUrl),
);

function render(state: { installationId: string; activated: boolean }) {
  status.textContent = state.activated ? 'Activated' : 'Not activated';
  status.dataset.activated = String(state.activated);
  installation.textContent = state.installationId;
  form.hidden = state.activated;
}

let submitting = false;

async function refresh() {
  try {
    render(await service.getState());
  } catch (error) {
    message.textContent = activationErrorMessage(error);
  } finally {
    button.disabled = submitting;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting || button.disabled) return;
  if (!code.value.trim()) {
    message.textContent = 'Enter a valid activation code';
    code.focus();
    return;
  }
  submitting = true;
  button.disabled = true;
  button.textContent = 'Activating…';
  message.textContent = '';
  const activationCode = code.value;
  code.value = '';
  try {
    render(await service.activate(activationCode));
  } catch (error) {
    message.textContent = activationErrorMessage(error);
  } finally {
    submitting = false;
    button.disabled = false;
    button.textContent = 'Activate';
  }
});

// Reevalúa expiración si el popup permanece abierto; no consulta ningún endpoint futuro.
window.addEventListener('focus', () => {
  void refresh();
});
window.setInterval(() => {
  if (!submitting) void refresh();
}, 30000);
void refresh();

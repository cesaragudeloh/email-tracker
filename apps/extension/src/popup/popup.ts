import './popup.css';
import { activationBridge } from '../api/activationMessages.js';
import { TrackingView } from './trackingView.js';
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
const service = activationBridge;
const trackingView = new TrackingView(
  element<HTMLElement>('#tracking-history'),
);

function render(state: { installationId: string; activated: boolean }) {
  status.textContent = state.activated ? 'Activated' : 'Not activated';
  status.dataset.activated = String(state.activated);
  installation.textContent = state.installationId;
  form.hidden = state.activated;
  trackingView.setActivated(state.activated);
}

let submitting = false;
let stateRequest = 0;

async function refresh() {
  const request = ++stateRequest;
  try {
    const state = await service.getState();
    if (request !== stateRequest) return;
    message.textContent = '';
    render(state);
  } catch (error) {
    if (request !== stateRequest) return;
    trackingView.setActivated(false);
    status.textContent = 'Not activated';
    status.dataset.activated = 'false';
    form.hidden = false;
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
  stateRequest++;
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

// Recheck local authorization on focus. No periodic tracking or state polling.
window.addEventListener('focus', () => {
  if (!submitting) void refresh();
});
void refresh();

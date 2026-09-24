import './popup.css';

const statusElement = document.querySelector<HTMLElement>('#activation-status');

if (!statusElement) {
  throw new Error('Popup status element is missing');
}

// Estado fijo de la base; aún no existe un sistema de activación.
statusElement.textContent = 'Not activated';

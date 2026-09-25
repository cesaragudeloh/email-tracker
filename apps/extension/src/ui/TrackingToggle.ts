import styles from './TrackingToggle.css?inline';

export const trackingToggleSelector = '.email-tracker-toggle';

export interface TrackingToggle {
  readonly element: HTMLElement;
  readonly enabled: boolean;
}

export function createTrackingToggle(
  document: Document,
  onChange: (enabled: boolean) => void = () => {},
): TrackingToggle {
  const element = document.createElement('span');
  element.className = 'email-tracker-toggle';
  // Aísla el checkbox de las reglas CSS y formularios de Gmail.
  const shadow = element.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = styles;
  const label = document.createElement('label');
  label.className = 'email-tracker-toggle__label';
  const input = document.createElement('input');
  input.className = 'email-tracker-toggle__input';
  input.type = 'checkbox';
  input.checked = false;
  const text = document.createElement('span');
  text.className = 'email-tracker-toggle__text';
  text.textContent = 'Track email';
  label.append(input, text);
  shadow.append(style, label);
  input.addEventListener('change', () => onChange(input.checked));

  return {
    element,
    get enabled() {
      return input.checked;
    },
  };
}

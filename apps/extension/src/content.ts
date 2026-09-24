import { selectProvider } from './providers/selectProvider.js';

console.info('Email Tracker extension active');

const adapter = selectProvider(window.location, document, () => {
  console.info('Email Tracker: Gmail compose detected');
});
adapter?.start();

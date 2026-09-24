import { createActivationStorage } from './activation/storage.js';

const storage = createActivationStorage();
// Se ejecuta en cada inicio del worker; reutiliza el UUID y restringe el acceso al token.
void storage.getInstallationId().catch(() => {
  console.warn(JSON.stringify({ event: 'activation_storage_unavailable' }));
});

import { createTrackingClient } from './api/trackingClient.js';
import {
  createTrackingMessageListener,
  createTrackingQueryListener,
} from './api/trackingMessages.js';
import { createActivationMessageListener } from './api/activationMessages.js';
import { createActivationStorage } from './activation/storage.js';
import { createActivationService } from './activation/activationService.js';
import { createApiClient } from './api/client.js';
import { config } from './config.js';
import { createTrackingHistoryStorage } from './tracking/historyStorage.js';
import { createTrackingRecorder } from './tracking/trackingRecorder.js';

const storage = createActivationStorage();
const activation = createActivationService(
  storage,
  createApiClient(config.apiBaseUrl),
);
const history = createTrackingHistoryStorage(storage.getInstallationId);
const client = createTrackingClient(storage);
void storage.getInstallationId().catch(() => {
  console.warn(JSON.stringify({ event: 'activation_storage_unavailable' }));
});
chrome.runtime.onMessage.addListener(
  createTrackingMessageListener(
    createTrackingRecorder(client.createTracking, history.addTrackedEmail),
    chrome.runtime.id,
  ),
);
chrome.runtime.onMessage.addListener(
  createTrackingQueryListener(
    client.getTracking,
    history.listTrackedEmails,
    async () => (await activation.getState()).activated,
    chrome.runtime.id,
  ),
);
chrome.runtime.onMessage.addListener(
  createActivationMessageListener(activation, chrome.runtime.id),
);

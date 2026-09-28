import type { CreateTracking } from '../../api/trackingMessages.js';
import { ComposeSendController } from '../shared/ComposeSendController.js';
import type { GmailTrackingControls } from './GmailTrackingControls.js';
import { gmailDom } from './gmailDom.js';
export class GmailSendController extends ComposeSendController {
  constructor(
    document: Document,
    controls: GmailTrackingControls,
    create?: CreateTracking,
    warn?: () => void,
    created?: () => void,
    pixelWarning?: () => void,
  ) {
    super(document, controls, gmailDom, create, warn, created, pixelWarning);
  }
}

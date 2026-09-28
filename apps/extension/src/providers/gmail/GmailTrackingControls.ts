import { ComposeTrackingControls } from '../shared/ComposeTrackingControls.js';
import { gmailDom } from './gmailDom.js';
export class GmailTrackingControls extends ComposeTrackingControls {
  constructor() {
    super(gmailDom);
  }
}

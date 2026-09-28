import { TrackingPixel } from '../shared/TrackingPixel.js';
import { gmailDom } from './gmailDom.js';
export { validateTrackingUrl } from '../shared/TrackingPixel.js';
export class GmailTrackingPixel extends TrackingPixel {
  constructor() {
    super(gmailDom);
  }
}

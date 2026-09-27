import UAParser from 'ua-parser-js';
import type { OpenEnrichment } from '@email-tracker/shared';

export type UserAgentResult = Pick<
  OpenEnrichment,
  'browser' | 'browserVersion' | 'os' | 'deviceType'
>;
export class UserAgentService {
  constructor(
    private readonly parser: (ua: string) => UAParser.IResult = (ua) =>
      new UAParser(ua).getResult(),
  ) {}
  parse(raw: string): UserAgentResult {
    if (!raw.trim())
      return {
        browser: 'Unknown',
        browserVersion: null,
        os: 'Unknown',
        deviceType: 'Unknown',
      };
    const result = this.parser(raw);
    const os =
      result.os.name === 'Mac OS' ? 'macOS' : result.os.name || 'Unknown';
    const type = result.device.type;
    const deviceType =
      type === 'mobile'
        ? 'Mobile'
        : type === 'tablet'
          ? 'Tablet'
          : !type &&
              ['Windows', 'macOS', 'Linux', 'Ubuntu', 'Chromium OS'].includes(
                os,
              )
            ? 'Desktop'
            : 'Unknown';
    return {
      browser: result.browser.name || 'Unknown',
      browserVersion: result.browser.version || null,
      os,
      deviceType,
    };
  }
}

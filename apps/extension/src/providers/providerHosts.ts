const outlookHosts = new Set([
  'outlook.office.com',
  'outlook.live.com',
  'outlook.office365.com',
]);

export function isOutlookLocation(
  location: Pick<Location, 'hostname' | 'protocol'>,
): boolean {
  return location.protocol === 'https:' && outlookHosts.has(location.hostname);
}

export function isMailOrigin(url: URL): boolean {
  return (
    url.port === '' &&
    (isOutlookLocation(url) ||
      (url.protocol === 'https:' && url.hostname === 'mail.google.com'))
  );
}

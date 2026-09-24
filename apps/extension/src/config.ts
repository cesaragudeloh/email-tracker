export function resolveApiBaseUrl(mode: string, configured?: string): string {
  const value =
    configured?.trim() ||
    (mode === 'development' ? 'http://localhost:3000' : '');
  if (!value) return '';
  const url = new URL(value);
  const localHttp =
    mode === 'development' &&
    url.protocol === 'http:' &&
    url.hostname === 'localhost';
  if (
    (url.protocol !== 'https:' && !localHttp) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Activation API must use HTTPS (localhost HTTP is development only)',
    );
  }
  return url.href.replace(/\/$/, '');
}

export const config = {
  apiBaseUrl: resolveApiBaseUrl(
    import.meta.env?.MODE ?? 'production',
    import.meta.env?.VITE_ACTIVATION_API_URL,
  ),
};

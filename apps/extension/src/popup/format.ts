import type { OpenEnrichment } from '@email-tracker/shared';
export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
export function formatOpenCount(count: number): string {
  return `${count} ${count === 1 ? 'open' : 'opens'}`;
}
export function formatSubject(subject: string): string {
  return subject.trim() ? subject : '(No subject)';
}

export function formatLocation(event: Partial<OpenEnrichment>): string {
  return (
    [event.city, event.region, event.country].filter(Boolean).join(', ') ||
    'Location unavailable'
  );
}
export function formatDevice(event: Partial<OpenEnrichment>): string {
  const parts = [event.browser, event.os, event.deviceType].filter(
    (value) => value && value !== 'Unknown',
  );
  return parts.length ? parts.join(' · ') : 'Unknown device';
}

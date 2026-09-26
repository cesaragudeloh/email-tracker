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

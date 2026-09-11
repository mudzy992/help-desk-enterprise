import { SlaError } from './sla.error';

export function assertValidIanaTimezone(timeZone: string): string {
  const normalized = timeZone.trim();
  if (normalized.length === 0) {
    throw new SlaError('INVALID_TIMEZONE');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(new Date());
  } catch {
    throw new SlaError('INVALID_TIMEZONE');
  }
  return normalized;
}

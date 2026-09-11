const isoDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isInstallSetupComplete(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const completedAt = value.trim();
  if (!isoDateTimePattern.test(completedAt)) {
    return false;
  }
  return !Number.isNaN(Date.parse(completedAt));
}

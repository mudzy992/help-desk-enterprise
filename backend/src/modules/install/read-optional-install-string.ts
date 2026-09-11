export function readOptionalInstallString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

export function isConfiguredInstallSecret(value: unknown): boolean {
  return readOptionalInstallString(value) !== undefined;
}

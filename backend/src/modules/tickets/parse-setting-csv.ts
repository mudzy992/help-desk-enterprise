export function parseSettingCsv(value: unknown): readonly string[] {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function parseRequiredSettingCsv(value: unknown): readonly string[] {
  if (typeof value !== 'string') {
    throw new Error('INVALID_CSV');
  }
  return parseSettingCsv(value);
}

const maximumChangeReasonLength = 512;

export function requireCatalogChangeReason(value: string): string | null {
  const reason = value.trim();
  if (reason.length === 0 || reason.length > maximumChangeReasonLength) {
    return null;
  }
  return reason;
}

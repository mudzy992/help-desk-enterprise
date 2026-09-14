const maximumChangeReasonLength = 512;

export function requireConfigChangeReason(value: string): string | null {
  const reason = value.trim();
  if (reason.length === 0) {
    return null;
  }
  if (reason.length > maximumChangeReasonLength) {
    return null;
  }
  return reason;
}

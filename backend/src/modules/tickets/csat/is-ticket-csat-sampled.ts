export function isTicketCsatSampled(
  ticketId: string,
  samplingRate: number,
): boolean {
  if (samplingRate >= 1) {
    return true;
  }
  if (samplingRate <= 0) {
    return false;
  }
  return hashUnitInterval(ticketId) < samplingRate;
}

function hashUnitInterval(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

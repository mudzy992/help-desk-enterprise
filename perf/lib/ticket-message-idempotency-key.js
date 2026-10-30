/**
 * Builds a valid UUID v4 idempotency key for the message-create API.
 *
 * The key is unique for a given timestamp, virtual user and iteration. Including
 * the timestamp also prevents a later perf run against a persistent environment
 * from replaying a message created by an earlier run.
 */
export function ticketMessageIdempotencyKey(virtualUser, iteration, nowMs) {
  const timestamp = toHex(nowMs, 12);
  const vu = toHex(virtualUser, 3);
  const runIteration = toHex(iteration, 12);

  // UUID version and variant bits are fixed to the v4 contract enforced by
  // CreateTicketMessageDto (@IsUUID('4')). The CI profile uses at most 2,800 VUs.
  return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-4${vu}-8${runIteration.slice(0, 3)}-${runIteration.slice(3)}${vu}`;
}

function toHex(value, width) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new RangeError('UUID components must be non-negative safe integers');
  }
  return numeric.toString(16).padStart(width, '0').slice(-width);
}

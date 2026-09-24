/**
 * Pure Socket.IO/Engine.IO packet helpers.
 *
 * The load test talks the wire protocol directly because k6 has no Socket.IO
 * client. Keeping the encoding here (no k6 imports) means the same functions
 * can be unit checked with plain Node — see `perf/validate.js`.
 */

export const engineIoPacket = {
  open: '0',
  ping: '2',
  pong: '3',
  message: '4',
  upgrade: '5',
  noop: '6',
};

export const socketIoPacket = {
  connect: '0',
  disconnect: '1',
  event: '2',
  ack: '3',
  error: '4',
};

/** Engine.IO handshake URL used for the WebSocket transport. */
export function buildSocketUrl(baseUrl, socketPath = '/socket.io/') {
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${socketPath}${separator}EIO=4&transport=websocket`;
}

/** Namespace connect packet; carries the JWT as Socket.IO `auth`. */
export function encodeConnectPacket(namespace, auth) {
  const payload = auth === undefined ? '' : JSON.stringify(auth);
  return `${engineIoPacket.message}${socketIoPacket.connect}${namespace}${payload}`;
}

/** Client event packet, e.g. `42["ticket.join",{"ticketId":"t-1"}]`. */
export function encodeEventPacket(eventName, payload) {
  return `${engineIoPacket.message}${socketIoPacket.event}${JSON.stringify([
    eventName,
    payload === undefined ? {} : payload,
  ])}`;
}

export function encodePongPacket() {
  return engineIoPacket.pong;
}

export function isOpenPacket(packet) {
  return typeof packet === 'string' && packet.startsWith(engineIoPacket.open);
}

export function isPingPacket(packet) {
  return packet === engineIoPacket.ping;
}

export function isConnectAckPacket(packet) {
  return (
    typeof packet === 'string' &&
    (packet.startsWith(`${engineIoPacket.message}${socketIoPacket.connect}`) ||
      packet.startsWith('40')) &&
    !packet.startsWith('44')
  );
}

export function isConnectErrorPacket(packet) {
  return (
    typeof packet === 'string' && packet.startsWith('44')
  );
}

/**
 * Reads an incoming server event: returns `{ event, payload }` or null when the
 * frame is not a Socket.IO event (heartbeats, acks, binary attachments).
 */
export function parseEventPacket(packet) {
  if (
    typeof packet !== 'string' ||
    !packet.startsWith(`${engineIoPacket.message}${socketIoPacket.event}`)
  ) {
    return null;
  }
  const body = packet.slice(2);
  const namespaced = body.startsWith('/') ? body.slice(body.indexOf('[')) : body;
  try {
    const parsed = JSON.parse(namespaced);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
    return { event: String(parsed[0]), payload: parsed[1] };
  } catch {
    return null;
  }
}

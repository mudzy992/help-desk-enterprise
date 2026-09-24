import { WebSocket } from 'k6/experimental/websockets';
import { performanceMetrics } from './metrics.js';
import {
  buildSocketUrl,
  encodeConnectPacket,
  encodeEventPacket,
  encodePongPacket,
  isConnectErrorPacket,
  isOpenPacket,
  isPingPacket,
  parseEventPacket,
} from './socket-io-packets.js';

/**
 * Opens one Socket.IO session over the WebSocket transport.
 *
 * k6 has no Socket.IO client, so the handshake is spoken directly:
 * Engine.IO open frame -> `40{"token":...}` -> join the configured ticket rooms
 * -> count every event frame for the `ws_events_received` metric.
 *
 * The caller keeps the VU alive (`sleep`) and then calls `close()`. Any protocol
 * surprise is counted in `ws_connect_errors` instead of throwing, so a load run
 * never dies because the server changed a handshake detail.
 */
export function openSocketSession({ config, token, ticketIds, onEvent }) {
  const url = buildSocketUrl(config.websocketUrl, config.socketPath);
  let connected = false;
  let closed = false;
  const socket = new WebSocket(url);

  socket.onopen = () => {
    performanceMetrics.wsClients.add(1);
  };

  socket.onerror = () => {
    performanceMetrics.wsConnectErrors.add(1);
  };

  socket.onmessage = (event) => {
    const data = String(event.data);
    if (isOpenPacket(data)) {
      socket.send(encodeConnectPacket('/', { token }));
      return;
    }
    if (isPingPacket(data)) {
      socket.send(encodePongPacket());
      return;
    }
    if (isConnectErrorPacket(data)) {
      performanceMetrics.wsConnectErrors.add(1);
      return;
    }
    const parsed = parseEventPacket(data);
    if (parsed === null) {
      if (data.startsWith('40')) {
        connected = true;
        for (const ticketId of ticketIds) {
          socket.send(encodeEventPacket('ticket.join', { ticketId }));
        }
      }
      return;
    }
    performanceMetrics.wsEventsReceived.add(1);
    if (onEvent !== undefined) {
      onEvent(parsed);
    }
  };

  return {
    isConnected: () => connected,
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      try {
        socket.close();
      } catch {
        performanceMetrics.wsConnectErrors.add(1);
      }
    },
  };
}

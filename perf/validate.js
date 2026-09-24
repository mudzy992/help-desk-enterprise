/**
 * Sanity check for the load-test package without k6.
 *
 *   node perf/validate.js
 *
 * It validates the parts that can be checked offline: parameter derivation,
 * Socket.IO packet encoding/decoding and the report renderer. Run it after any
 * change to perf/ — a broken helper would otherwise only show up as a failed
 * load run in the middle of a 30-minute window.
 */

import { perfConfig, fullThresholds, scenarioVus } from './config.js';
import {
  buildSocketUrl,
  encodeConnectPacket,
  encodeEventPacket,
  encodePongPacket,
  isConnectErrorPacket,
  isOpenPacket,
  isPingPacket,
  parseEventPacket,
} from './lib/socket-io-packets.js';
import { renderMarkdown } from './report.js';

let failures = 0;

function check(description, condition, detail) {
  if (condition) {
    console.log(`  ok   ${description}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL ${description}${detail === undefined ? '' : ` — ${detail}`}`);
}

function section(title) {
  console.log(`\n${title}`);
}

section('config');
const vus = scenarioVus(perfConfig);
check(
  'active pool matches virtualUsers * activeRatio',
  vus.active === Math.round(2800 * 0.7),
  `active=${vus.active}`,
);
check(
  'behaviour mix covers the whole pool',
  vus.browserDashboard + vus.agentTicketFlow + vus.searchHeavy + vus.websocketClients ===
    vus.active,
  `${vus.browserDashboard}+${vus.agentTicketFlow}+${vus.searchHeavy}+${vus.websocketClients} != ${vus.active}`,
);
check('budgets come from the plan (§4.2)', perfConfig.budgets.readP95Ms === 200);
check(
  'thresholds reference the custom trends',
  Object.keys(fullThresholds(perfConfig)).includes('tickets_list_duration'),
);

section('socket.io packets');
const connect = encodeConnectPacket('/', { token: 'jwt-token' });
check('connect packet carries the token', connect === '40/{"token":"jwt-token"}', connect);
check('open frame detected', isOpenPacket('0{"sid":"abc","upgrades":[]}'));
check('ping frame detected', isPingPacket('2'));
check('pong frame built', encodePongPacket() === '3');
const join = encodeEventPacket('ticket.join', { ticketId: 'ticket-1' });
check('event packet shape', join === '42["ticket.join",{"ticketId":"ticket-1"}]', join);
check(
  'event packet decoded',
  JSON.stringify(parseEventPacket(join)) ===
    JSON.stringify({ event: 'ticket.join', payload: { ticketId: 'ticket-1' } }),
);
check(
  'namespaced event decoded',
  parseEventPacket('42/admin,["notificationCreated",{"id":"n-1"}]')?.event ===
    'notificationCreated',
);
check('heartbeat is not an event', parseEventPacket('2') === null);
check('connect error frame detected', isConnectErrorPacket('44{"message":"Unauthorized"}'));
check(
  'socket url keeps the transport parameters',
  buildSocketUrl('ws://localhost:10001', '/socket.io/') ===
    'ws://localhost:10001/socket.io/?EIO=4&transport=websocket',
);

section('report renderer');
const synthetic = {
  state: { testRunDurationMs: 60_000 },
  metrics: {
    tickets_list_duration: {
      values: { 'p(50)': 120, 'p(95)': 260, 'p(99)': 500, max: 900 },
      thresholds: { 'p(95)<200': { ok: false } },
    },
    http_reqs: { values: { count: 1000 } },
  },
};
const markdown = renderMarkdown(synthetic, {
  ...perfConfig,
  reportLabel: 'synthetic',
});
check('markdown has a title', markdown.startsWith('# Load test — synthetic'));
check('markdown lists the endpoint table row', markdown.includes('GET /tickets'));
check('markdown reports a failed threshold', markdown.includes('p(95)<200 | FAILED'));
check('markdown lists the plan budgets', markdown.includes('P95 read endpoint'));

console.log('');
if (failures > 0) {
  console.log(`perf/validate: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('perf/validate: all checks passed');

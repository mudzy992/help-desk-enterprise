import { sleep } from 'k6';
import http from 'k6/http';
import { authorizedHeaders, expectOk, login, pickToken } from './http-helpers.js';
import { recordResponse } from './metrics.js';
import { openSocketSession } from './ws-client.js';

/**
 * The four behaviours from the plan (§5.1), shared by `smoke.js` and `full.js`
 * so a smoke run exercises exactly the same code paths as the full run.
 */

/** Last message timestamp per virtual user, to honour "1 message / 30 s". */
const lastMessageAt = {};

export function setup(config) {
  const agentToken = login(config, config.credentials.agent);
  const requesterToken = login(config, config.credentials.requester);
  const tokens = [agentToken, requesterToken].filter((token) => token !== null);
  if (tokens.length === 0) {
    throw new Error(
      'No access token: set AGENT_EMAIL/AGENT_PASSWORD (and optionally REQUESTER_*) for a seeded environment.',
    );
  }
  return { tokens };
}

/** 40%: read the dashboard the way a requester does. */
export function browserDashboard(config, data) {
  const headers = authorizedHeaders(pickToken(data.tokens, __VU));

  const tickets = http.get(`${config.baseUrl}${config.paths.tickets}`, {
    ...headers,
    tags: { endpoint: 'tickets.list' },
  });
  expectOk(tickets, 'tickets.list');
  recordResponse('tickets.list', tickets, config);

  const unread = http.get(`${config.baseUrl}${config.paths.unreadCount}`, {
    ...headers,
    tags: { endpoint: 'notifications.unreadCount' },
  });
  expectOk(unread, 'notifications.unreadCount');
  recordResponse('notifications.unreadCount', unread, config);

  sleep(thinkTime(config));
}

/** 35%: list -> detail -> reply every 30 s. */
export function agentTicketFlow(config, data) {
  const token = pickToken(data.tokens, __VU);
  const headers = authorizedHeaders(token);

  const inbox = http.get(`${config.baseUrl}${config.paths.ticketInbox}`, {
    ...headers,
    tags: { endpoint: 'tickets.inbox' },
  });
  expectOk(inbox, 'tickets.inbox');

  const ticketId = readFirstTicketId(inbox);
  if (ticketId === null) {
    sleep(thinkTime(config));
    return;
  }

  const detail = http.get(`${config.baseUrl}${config.paths.tickets}/${ticketId}`, {
    ...headers,
    tags: { endpoint: 'tickets.detail' },
  });
  expectOk(detail, 'tickets.detail');
  recordResponse('tickets.detail', detail, config);

  const now = Date.now();
  const previous = lastMessageAt[__VU] || 0;
  if (now - previous >= config.behaviour.messageEverySeconds * 1000) {
    lastMessageAt[__VU] = now;
    const message = http.post(
      `${config.baseUrl}${config.paths.tickets}/${ticketId}/messages`,
      JSON.stringify({
        body: `load test probe ${now}`,
        visibility: 'staff',
      }),
      { ...headers, tags: { endpoint: 'tickets.message' } },
    );
    expectOk(message, 'tickets.message');
    recordResponse('tickets.message', message, config);
  }

  sleep(thinkTime(config));
}

/**
 * 10%: the search a user actually triggers.
 *
 * Phase 0 measures the CURRENT client behaviour (list + articles + directory
 * fan-out, see plan §1.2) so the after-Phase-1 run can prove the drop to one
 * request per input.
 */
export function searchHeavy(config, data) {
  const headers = authorizedHeaders(pickToken(data.tokens, __VU));
  const probe = `${config.behaviour.searchTerm}-${__VU}`;

    // `q`, not `search`: Phase 1.1 renamed the list parameter, and the old name now gets
    // a 400 from the validation pipe — which the smoke read as "the app is failing" while
    // it was the harness using a stale contract (20 failed requests per run).
    const tickets = http.get(
      `${config.baseUrl}${config.paths.tickets}?q=${encodeURIComponent(probe)}`,
      { ...headers, tags: { endpoint: 'search.listQuery' } },
    );
    expectOk(tickets, 'search.listQuery');

  const search = http.get(
    `${config.baseUrl}${config.paths.search}?q=${encodeURIComponent(probe)}&types=ticket,article,user`,
    { ...headers, tags: { endpoint: 'search.query' } },
  );
  // Phase 1 adds /search; before that the endpoint legitimately 404s and must
  // not fail the run — it is reported, not asserted.
  if (search.status !== 404) {
    recordResponse('search.query', search, config);
  }

  sleep(config.behaviour.searchEverySeconds);
}

/** 15%: hold a Socket.IO session and count inbound events. */
export function websocketClients(config, data) {
  const token = pickToken(data.tokens, __VU);
  const session = openSocketSession({
    config,
    token,
    ticketIds: config.behaviour.ticketIds,
  });

  sleep(holdSeconds(config));
  session.close();
}

function holdSeconds(config) {
  const [amount, unit] = parseDuration(config.load.duration);
  const seconds = unit === 'm' ? amount * 60 : amount;
  // Agents keep the socket open for most of the run instead of reconnecting.
  return Math.max(10, Math.round(seconds * (0.5 + Math.random() * 0.5)));
}

export function parseDuration(value) {
  const match = /^(\d+)([smh])$/.exec(String(value).trim());
  if (match === null) {
    return [30, 'm'];
  }
  return [Number(match[1]), match[2]];
}

export function thinkTime(config) {
  const { min, max } = config.load.thinkTimeSeconds;
  return min + Math.random() * (max - min);
}

function readFirstTicketId(response) {
  try {
    const body = response.json();
    const items = Array.isArray(body) ? body : body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return null;
    }
    const first = items[0];
    return typeof first?.id === 'string' ? first.id : null;
  } catch {
    return null;
  }
}

import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { perfConfig } from './config.js';
import { authorizedHeaders, login } from './lib/http-helpers.js';

/**
 * Paket 3.4 (§20): dedicated, manual scenario for change management (the
 * module is off by default, so it is not part of `full.js` / `smoke.js`).
 *
 *   k6 run -e CHANGES_EMAIL=… -e CHANGES_PASSWORD=… \
 *          -e REPORT_LABEL=changes-list perf/changes-list.js
 *
 * Needs the change addon on, at least one CAB group and a user with
 * `change.read`; with MFA pass ACCESS_TOKEN. Budgets: register (open changes,
 * cursor), a filtered search and the detail with conflicts, approvals and
 * history (p95 < 200 ms), and the month calendar (< 400 ms, one query per
 * period). Override with CHANGES_LIST_P95_MS, CHANGES_SEARCH_P95_MS,
 * CHANGES_DETAIL_P95_MS, CHANGES_CALENDAR_P95_MS.
 */

const env = __ENV;
const vus = Number(env.CHANGES_VU || 10);
const duration = env.CHANGES_DURATION || '1m';
const budgets = {
  list: Number(env.CHANGES_LIST_P95_MS || 200),
  search: Number(env.CHANGES_SEARCH_P95_MS || 200),
  detail: Number(env.CHANGES_DETAIL_P95_MS || 200),
  calendar: Number(env.CHANGES_CALENDAR_P95_MS || 400),
};

const listDuration = new Trend('changes_list_duration', true);
const searchDuration = new Trend('changes_search_duration', true);
const detailDuration = new Trend('changes_detail_duration', true);
const calendarDuration = new Trend('changes_calendar_duration', true);

export const options = {
  scenarios: {
    register: { executor: 'constant-vus', exec: 'register', vus, duration, tags: { behaviour: 'changes_register' } },
    calendar: { executor: 'constant-vus', exec: 'calendar', vus: Math.max(1, Math.floor(vus / 3)), duration, tags: { behaviour: 'changes_calendar' } },
  },
  thresholds: {
    changes_list_duration: [`p(95)<${budgets.list}`],
    changes_search_duration: [`p(95)<${budgets.search}`],
    changes_detail_duration: [`p(95)<${budgets.detail}`],
    changes_calendar_duration: [`p(95)<${budgets.calendar}`],
    http_req_failed: ['rate<0.005'],
  },
};

const allStatuses = 'DRAFT,ASSESSMENT,AUTHORIZATION,SCHEDULED,IMPLEMENTING,REVIEW,CLOSED,REJECTED,CANCELLED';

export function setup() {
  let token = env.ACCESS_TOKEN || null;
  if (token === null) {
    token = login(perfConfig, {
      email: env.CHANGES_EMAIL || perfConfig.credentials.agent.email,
      password: env.CHANGES_PASSWORD || perfConfig.credentials.agent.password,
    });
  }
  if (token === null) fail('Login failed — check CHANGES_EMAIL / CHANGES_PASSWORD.');
  const probe = http.get(`${perfConfig.baseUrl}/changes/capabilities`, authorizedHeaders(token));
  const capabilities = probe.status === 200 ? probe.json() : null;
  if (!capabilities || capabilities.enabled !== true || capabilities.canRead !== true) {
    fail('The change module is off (addon or no CAB group) or the user has no change.read.');
  }
  const all = http.get(`${perfConfig.baseUrl}/changes?status=${allStatuses}&limit=50`, authorizedHeaders(token));
  const ids = all.status === 200 ? all.json().items.map((item) => item.id) : [];
  if (ids.length === 0) console.warn('No changes in scope — the detail metric stays empty.');
  return { token, ids };
}

const searches = ['server', 'update', 'mreža', 'CHG-', 'backup'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function register(data) {
  const first = get('/changes?limit=50', data.token, 'changes.list');
  listDuration.add(first.timings.duration);
  const body = first.status === 200 ? first.json() : null;
  if (body && body.nextCursor) {
    const next = get(`/changes?limit=50&cursor=${encodeURIComponent(body.nextCursor)}`, data.token, 'changes.list.next');
    listDuration.add(next.timings.duration);
  }
  const search = get(`/changes?limit=50&search=${encodeURIComponent(pick(searches))}&risk=HIGH,CRITICAL&type=NORMAL,EMERGENCY`, data.token, 'changes.search');
  searchDuration.add(search.timings.duration);
  if (data.ids.length > 0) {
    const id = encodeURIComponent(pick(data.ids));
    for (const [path, endpoint] of [
      [`/changes/${id}`, 'changes.detail'],
      [`/changes/${id}/conflicts`, 'changes.conflicts'],
      [`/changes/${id}/approvals`, 'changes.approvals'],
      [`/changes/${id}/events`, 'changes.events'],
    ]) {
      detailDuration.add(get(path, data.token, endpoint).timings.duration);
    }
  }
  sleep(1);
}

export function calendar(data) {
  // A month grid (6 weeks) around a random month of the current year.
  const now = new Date();
  const month = Math.floor(Math.random() * 12);
  const from = new Date(Date.UTC(now.getUTCFullYear(), month, 1) - 6 * 86_400_000);
  const to = new Date(from.getTime() + 42 * 86_400_000);
  const response = get(`/changes/calendar?from=${from.toISOString()}&to=${to.toISOString()}`, data.token, 'changes.calendar');
  calendarDuration.add(response.timings.duration);
  sleep(2);
}

function get(path, token, endpoint) {
  const response = http.get(`${perfConfig.baseUrl}${path}`, { ...authorizedHeaders(token), tags: { endpoint } });
  check(response, { [`${endpoint} returns 200`]: (value) => value.status === 200 });
  return response;
}

export function handleSummary(data) {
  const label = env.REPORT_LABEL || 'changes-list';
  const rows = [
    ['changes_list_duration', 'GET /changes (otvorene, stranica 50, kursor)', budgets.list],
    ['changes_search_duration', 'GET /changes?search=…&risk=…&type=…', budgets.search],
    ['changes_detail_duration', 'GET /changes/:id, /conflicts, /approvals, /events', budgets.detail],
    ['changes_calendar_duration', 'GET /changes/calendar (6 sedmica)', budgets.calendar],
  ];
  const lines = [`# Changes load test — ${label}`, '', '| Metric | p50 | p95 | max | budget p95 |', '|---|---|---|---|---|'];
  for (const [name, description, budget] of rows) {
    const values = data.metrics[name] ? data.metrics[name].values : undefined;
    if (values === undefined || values.med === undefined) continue;
    const ms = (number) => `${Math.round(number)} ms`;
    lines.push(`| ${description} | ${ms(values.med)} | ${ms(values['p(95)'])} | ${ms(values.max)} | ${budget} ms |`);
  }
  const markdown = `${lines.join('\n')}\n`;
  return {
    [`perf/results/${label}.json`]: JSON.stringify(data, null, 2),
    [`perf/results/${label}.md`]: markdown,
    stdout: markdown,
  };
}

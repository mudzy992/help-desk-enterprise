import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { perfConfig } from './config.js';
import { authorizedHeaders, login } from './lib/http-helpers.js';

/**
 * Paket 3.3: dedicated, manual scenario for problem management (the module is
 * off by default, so it is not part of `full.js` / `smoke.js`).
 *
 *   k6 run -e PROBLEMS_EMAIL=… -e PROBLEMS_PASSWORD=… \
 *          -e REPORT_LABEL=problems-list perf/problems-list.js
 *
 * Needs the problem addon on, at least one problem group and a user with
 * `problem.read`; with MFA pass ACCESS_TOKEN. Budgets (read p95 < 200 ms like
 * the rest of the application): register (open problems, cursor), a filtered
 * search, the detail with its ticket list and history, and the backlog report
 * pack (< 400 ms, aggregate; needs ORG_UNIT_ID). Override with
 * PROBLEMS_LIST_P95_MS, PROBLEMS_SEARCH_P95_MS, PROBLEMS_DETAIL_P95_MS,
 * PROBLEMS_REPORT_P95_MS.
 */

const env = __ENV;
const vus = Number(env.PROBLEMS_VU || 10);
const duration = env.PROBLEMS_DURATION || '1m';
const budgets = {
  list: Number(env.PROBLEMS_LIST_P95_MS || 200),
  search: Number(env.PROBLEMS_SEARCH_P95_MS || 200),
  detail: Number(env.PROBLEMS_DETAIL_P95_MS || 200),
  report: Number(env.PROBLEMS_REPORT_P95_MS || 400),
};

const listDuration = new Trend('problems_list_duration', true);
const searchDuration = new Trend('problems_search_duration', true);
const detailDuration = new Trend('problems_detail_duration', true);
const reportDuration = new Trend('problems_report_duration', true);

export const options = {
  scenarios: {
    register: { executor: 'constant-vus', exec: 'register', vus, duration, tags: { behaviour: 'problems_register' } },
    report: { executor: 'constant-vus', exec: 'report', vus: Math.max(1, Math.floor(vus / 5)), duration, tags: { behaviour: 'problems_report' } },
  },
  thresholds: {
    problems_list_duration: [`p(95)<${budgets.list}`],
    problems_search_duration: [`p(95)<${budgets.search}`],
    problems_detail_duration: [`p(95)<${budgets.detail}`],
    problems_report_duration: [`p(95)<${budgets.report}`],
    http_req_failed: ['rate<0.005'],
  },
};

export function setup() {
  let token = env.ACCESS_TOKEN || null;
  if (token === null) {
    token = login(perfConfig, {
      email: env.PROBLEMS_EMAIL || perfConfig.credentials.agent.email,
      password: env.PROBLEMS_PASSWORD || perfConfig.credentials.agent.password,
    });
  }
  if (token === null) fail('Login failed — check PROBLEMS_EMAIL / PROBLEMS_PASSWORD.');
  const probe = http.get(`${perfConfig.baseUrl}/problems/capabilities`, authorizedHeaders(token));
  const capabilities = probe.status === 200 ? probe.json() : null;
  if (!capabilities || capabilities.enabled !== true || capabilities.canRead !== true) {
    fail('The problem module is off (addon or no problem group) or the user has no problem.read.');
  }
  const options = http.get(`${perfConfig.baseUrl}/problems/options`, authorizedHeaders(token));
  const groups = options.status === 200 ? options.json().groups.map((group) => group.id) : [];
  const all = http.get(`${perfConfig.baseUrl}/problems?status=NEW,INVESTIGATING,KNOWN_ERROR,RESOLVED,CLOSED,CANCELLED&limit=50`, authorizedHeaders(token));
  const ids = all.status === 200 ? all.json().items.map((item) => item.id) : [];
  if (ids.length === 0) console.warn('No problems in scope — the detail metric stays empty.');
  const reportSlug = 'problem-backlog';
  const unitId = env.ORG_UNIT_ID || '';
  return { token, groups, ids, reportSlug, unitId };
}

const searches = ['mre', 'vpn', 'print', 'P-', 'disk'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function register(data) {
  const first = get('/problems?limit=50', data.token, 'problems.list');
  listDuration.add(first.timings.duration);
  const body = first.status === 200 ? first.json() : null;
  if (body && body.nextCursor) {
    const next = get(`/problems?limit=50&cursor=${encodeURIComponent(body.nextCursor)}`, data.token, 'problems.list.next');
    listDuration.add(next.timings.duration);
  }
  const group = data.groups.length > 0 ? `&groupId=${encodeURIComponent(pick(data.groups))}` : '';
  const search = get(`/problems?limit=50&search=${encodeURIComponent(pick(searches))}&priority=HIGH,CRITICAL${group}`, data.token, 'problems.search');
  searchDuration.add(search.timings.duration);
  if (data.ids.length > 0) {
    const id = encodeURIComponent(pick(data.ids));
    for (const [path, endpoint] of [
      [`/problems/${id}`, 'problems.detail'],
      [`/problems/${id}/tickets`, 'problems.tickets'],
      [`/problems/${id}/events`, 'problems.events'],
    ]) {
      detailDuration.add(get(path, data.token, endpoint).timings.duration);
    }
  }
  sleep(1);
}

export function report(data) {
  if (data.unitId === '') {
    sleep(5);
    return;
  }
  const response = get(`/reports/packs/${data.reportSlug}/preview?organizationalUnitId=${encodeURIComponent(data.unitId)}`, data.token, 'problems.report');
  reportDuration.add(response.timings.duration);
  sleep(2);
}

function get(path, token, endpoint) {
  const response = http.get(`${perfConfig.baseUrl}${path}`, { ...authorizedHeaders(token), tags: { endpoint } });
  check(response, { [`${endpoint} returns 200`]: (value) => value.status === 200 });
  return response;
}

export function handleSummary(data) {
  const label = env.REPORT_LABEL || 'problems-list';
  const rows = [
    ['problems_list_duration', 'GET /problems (otvoreni, stranica 50, kursor)', budgets.list],
    ['problems_search_duration', 'GET /problems?search=…&priority=…&groupId=…', budgets.search],
    ['problems_detail_duration', 'GET /problems/:id, /tickets, /events', budgets.detail],
    ['problems_report_duration', 'GET /reports/packs/problem-backlog/preview', budgets.report],
  ];
  const lines = [`# Problems load test — ${label}`, '', '| Metric | p50 | p95 | max | budget p95 |', '|---|---|---|---|---|'];
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

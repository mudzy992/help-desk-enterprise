import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { perfConfig } from './config.js';
import { authorizedHeaders, login } from './lib/http-helpers.js';

/**
 * Paket 3.2 (C10, §21): dedicated, manual scenario for the CMDB register. Not
 * part of `full.js` / `smoke.js` (the module is off by default), so the CI
 * gates stay comparable with earlier runs.
 *
 *   k6 run -e ASSETS_EMAIL=… -e ASSETS_PASSWORD=… \
 *          -e REPORT_LABEL=assets-list perf/assets-list.js
 *
 * Needs the CMDB addon on and a user with `asset.read` (ADMIN or an asset
 * manager); with MFA pass ACCESS_TOKEN instead. Budgets (§21, read p95 < 200 ms
 * like the rest of the application): first register page, a filtered search,
 * the second page by cursor, and the manager overview (< 400 ms, aggregate).
 * Override with ASSETS_LIST_P95_MS, ASSETS_SEARCH_P95_MS, ASSETS_OVERVIEW_P95_MS.
 */

const env = __ENV;
const vus = Number(env.ASSETS_VU || 10);
const duration = env.ASSETS_DURATION || '1m';
const budgets = {
  list: Number(env.ASSETS_LIST_P95_MS || 200),
  search: Number(env.ASSETS_SEARCH_P95_MS || 200),
  overview: Number(env.ASSETS_OVERVIEW_P95_MS || 400),
};

const listDuration = new Trend('assets_list_duration', true);
const searchDuration = new Trend('assets_search_duration', true);
const overviewDuration = new Trend('assets_overview_duration', true);

export const options = {
  scenarios: {
    register: { executor: 'constant-vus', exec: 'register', vus, duration, tags: { behaviour: 'assets_register' } },
    overview: { executor: 'constant-vus', exec: 'overview', vus: Math.max(1, Math.floor(vus / 5)), duration, tags: { behaviour: 'assets_overview' } },
  },
  thresholds: {
    assets_list_duration: [`p(95)<${budgets.list}`],
    assets_search_duration: [`p(95)<${budgets.search}`],
    assets_overview_duration: [`p(95)<${budgets.overview}`],
    http_req_failed: ['rate<0.005'],
  },
};

export function setup() {
  if (env.ACCESS_TOKEN) return { token: env.ACCESS_TOKEN };
  const token = login(perfConfig, {
    email: env.ASSETS_EMAIL || perfConfig.credentials.agent.email,
    password: env.ASSETS_PASSWORD || perfConfig.credentials.agent.password,
  });
  if (token === null) fail('Login failed — check ASSETS_EMAIL / ASSETS_PASSWORD.');
  const probe = http.get(`${perfConfig.baseUrl}/assets/capabilities`, authorizedHeaders(token));
  const capabilities = probe.status === 200 ? probe.json() : null;
  if (!capabilities || capabilities.enabled !== true || capabilities.canRead !== true) {
    fail('The CMDB module is off or the user has no asset.read.');
  }
  return { token, canReadReports: capabilities.canReadReports === true };
}

const searches = ['lap', 'mon', 'INV', 'dell', 'pc-'];

export function register(data) {
  const first = get('/assets?limit=50', data.token, 'assets.list');
  listDuration.add(first.timings.duration);
  const body = first.status === 200 ? first.json() : null;
  if (body && body.nextCursor) {
    const next = get(`/assets?limit=50&cursor=${encodeURIComponent(body.nextCursor)}`, data.token, 'assets.list.next');
    listDuration.add(next.timings.duration);
  }
  const term = searches[Math.floor(Math.random() * searches.length)];
  const search = get(`/assets?limit=50&search=${encodeURIComponent(term)}&status=IN_USE`, data.token, 'assets.search');
  searchDuration.add(search.timings.duration);
  sleep(1);
}

export function overview(data) {
  if (!data.canReadReports) {
    sleep(5);
    return;
  }
  const response = get('/assets/overview', data.token, 'assets.overview');
  overviewDuration.add(response.timings.duration);
  sleep(2);
}

function get(path, token, endpoint) {
  const response = http.get(`${perfConfig.baseUrl}${path}`, { ...authorizedHeaders(token), tags: { endpoint } });
  check(response, { [`${endpoint} returns 200`]: (value) => value.status === 200 });
  return response;
}

export function handleSummary(data) {
  const label = env.REPORT_LABEL || 'assets-list';
  const rows = [
    ['assets_list_duration', 'GET /assets (stranica 50, kursor)', budgets.list],
    ['assets_search_duration', 'GET /assets?search=…&status=IN_USE', budgets.search],
    ['assets_overview_duration', 'GET /assets/overview', budgets.overview],
  ];
  const lines = [`# Assets load test — ${label}`, '', '| Metric | p50 | p95 | max | budget p95 |', '|---|---|---|---|---|'];
  for (const [name, description, budget] of rows) {
    const values = data.metrics[name] ? data.metrics[name].values : undefined;
    if (values === undefined) continue;
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

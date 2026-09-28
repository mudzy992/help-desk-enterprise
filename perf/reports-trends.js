import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { perfConfig } from './config.js';
import { authorizedHeaders, login } from './lib/http-helpers.js';

/**
 * Package 2.5 (§9): dedicated, manual scenario for the report endpoints. It is
 * deliberately NOT part of `full.js` / `smoke.js`, so the "queries per request"
 * CI gate and the read mix stay comparable with earlier runs.
 *
 *   k6 run -e ORG_UNIT_ID=<root OU id> \
 *          -e REPORTS_EMAIL=… -e REPORTS_PASSWORD=… \
 *          -e REPORT_LABEL=reports-trends perf/reports-trends.js
 *
 * Scenarios (sequential, low VU — reports are an analyst workload, not traffic):
 *   - trends_cold: 36 months, every iteration shifts `from` by one day so the
 *     10-minute cache never hits (worst case, acceptance §11.1: < 1 s);
 *   - trends_warm: one fixed 12-month query, served from the cache (< 50 ms
 *     server side; the budget here includes the network);
 *   - dashboard: the sanitised `/reports/dashboard` (§9: p95 < 400 ms).
 *
 * Budgets can be overridden with TRENDS_COLD_P95_MS, TRENDS_WARM_P95_MS and
 * DASHBOARD_P95_MS. The session must belong to a user with `reports.view`
 * for the given unit (ADMIN or a scoped agent).
 */

const env = __ENV;
const organizationalUnitId = env.ORG_UNIT_ID || '';
const vus = Number(env.REPORT_VU || 5);
const duration = env.REPORT_DURATION || '1m';
const budgets = {
  trendsCold: Number(env.TRENDS_COLD_P95_MS || 1000),
  trendsWarm: Number(env.TRENDS_WARM_P95_MS || 150),
  dashboard: Number(env.DASHBOARD_P95_MS || 400),
};

const trendsColdDuration = new Trend('report_trends_cold_duration', true);
const trendsWarmDuration = new Trend('report_trends_warm_duration', true);
const dashboardDuration = new Trend('report_dashboard_duration', true);

export const options = {
  discardResponseBodies: false,
  scenarios: {
    trends_cold: {
      executor: 'constant-vus',
      exec: 'trendsCold',
      vus,
      duration,
      tags: { behaviour: 'report_trends_cold' },
    },
    trends_warm: {
      executor: 'constant-vus',
      exec: 'trendsWarm',
      vus,
      duration,
      startTime: duration,
      tags: { behaviour: 'report_trends_warm' },
    },
    dashboard: {
      executor: 'constant-vus',
      exec: 'dashboard',
      vus,
      duration,
      startTime: `${2 * parseSeconds(duration)}s`,
      tags: { behaviour: 'report_dashboard' },
    },
  },
  thresholds: {
    report_trends_cold_duration: [`p(95)<${budgets.trendsCold}`],
    report_trends_warm_duration: [`p(95)<${budgets.trendsWarm}`],
    report_dashboard_duration: [`p(95)<${budgets.dashboard}`],
    http_req_failed: ['rate<0.005'],
  },
};

export function setup() {
  if (organizationalUnitId.length === 0) {
    fail('ORG_UNIT_ID is required (root organizational unit id).');
  }
  const token = login(perfConfig, {
    email: env.REPORTS_EMAIL || perfConfig.credentials.agent.email,
    password: env.REPORTS_PASSWORD || perfConfig.credentials.agent.password,
  });
  if (token === null) {
    fail('Login failed — check REPORTS_EMAIL / REPORTS_PASSWORD.');
  }
  return { token };
}

export function trendsCold(data) {
  // Unique window per VU+iteration (28 × 28 = 784 keys): shifting both ends
  // by whole days avoids the 10-minute cache without unknown query params,
  // which the API validation rejects.
  const slot = ((__VU - 1) * 997 + __ITER) % 784;
  const today = new Date();
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() - Math.floor(slot / 28));
  const from = new Date(to.getFullYear(), to.getMonth() - 35, 1 + (slot % 28));
  const query = `organizationalUnitId=${organizationalUnitId}&from=${day(from)}&to=${day(to)}&granularity=month`;
  const response = get(`/reports/trends?${query}`, data.token, 'reports.trends.cold');
  trendsColdDuration.add(response.timings.duration);
  sleep(1);
}

export function trendsWarm(data) {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth() - 11, 1);
  const query = `organizationalUnitId=${organizationalUnitId}&from=${day(from)}&to=${day(to)}&granularity=month`;
  const response = get(`/reports/trends?${query}`, data.token, 'reports.trends.warm');
  trendsWarmDuration.add(response.timings.duration);
  sleep(0.5);
}

export function dashboard(data) {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);
  const query = `organizationalUnitId=${organizationalUnitId}&from=${from.toISOString()}&to=${to.toISOString()}`;
  const response = get(`/reports/dashboard?${query}`, data.token, 'reports.dashboard');
  dashboardDuration.add(response.timings.duration);
  sleep(1);
}

function get(path, token, endpoint) {
  const response = http.get(`${perfConfig.baseUrl}${path}`, {
    ...authorizedHeaders(token),
    tags: { endpoint },
  });
  check(response, { [`${endpoint} returns 200`]: (value) => value.status === 200 });
  return response;
}

function day(value) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function parseSeconds(value) {
  const match = /^(\d+)(s|m)$/.exec(value);
  if (match === null) return 60;
  return Number(match[1]) * (match[2] === 'm' ? 60 : 1);
}

export function handleSummary(data) {
  const label = env.REPORT_LABEL || 'reports-trends';
  const rows = [
    ['report_trends_cold_duration', 'GET /reports/trends (36 mj, bez keša)', budgets.trendsCold],
    ['report_trends_warm_duration', 'GET /reports/trends (12 mj, keš)', budgets.trendsWarm],
    ['report_dashboard_duration', 'GET /reports/dashboard', budgets.dashboard],
  ];
  const lines = [`# Reports load test — ${label}`, '', '| Metric | p50 | p95 | max | budget p95 |', '|---|---|---|---|---|'];
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

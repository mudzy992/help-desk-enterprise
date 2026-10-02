import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import exec from 'k6/execution';
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
 *   - trends_warm: one fixed 12-month query, served from the cache (< 50 ms
 *     server side; the budget here includes the network);
 *   - dashboard: the sanitised `/reports/dashboard` (§9: p95 < 400 ms);
 *   - trends_cold: COLD_ITERATIONS (≤ 120) distinct 36-month windows × priority
 *     filters, each a real cache miss (acceptance §11.1: < 1 s). Run it at most
 *     once per 10 minutes, otherwise the previous run warmed the same keys.
 *
 * Budgets can be overridden with TRENDS_COLD_P95_MS, TRENDS_WARM_P95_MS and
 * DASHBOARD_P95_MS. With MFA enabled pass ACCESS_TOKEN (browser session)
 * instead of REPORTS_EMAIL / REPORTS_PASSWORD. The session must belong to a user with `reports.view`
 * for the given unit (ADMIN or a scoped agent).
 */

const env = __ENV;
const organizationalUnitId = env.ORG_UNIT_ID || '';
const vus = Number(env.REPORT_VU || 5);
const duration = env.REPORT_DURATION || '1m';
// 24 month shifts × 5 priority filters = 120 distinct cache keys (see trendsCold).
const coldIterations = Math.min(Number(env.COLD_ITERATIONS || 100), 120);
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
    trends_warm: {
      executor: 'constant-vus',
      exec: 'trendsWarm',
      vus,
      duration,
      tags: { behaviour: 'report_trends_warm' },
    },
    dashboard: {
      executor: 'constant-vus',
      exec: 'dashboard',
      vus,
      duration,
      startTime: duration,
      tags: { behaviour: 'report_dashboard' },
    },
    // Last, and iteration-bound: every request must be a real cache miss.
    trends_cold: {
      executor: 'shared-iterations',
      exec: 'trendsCold',
      vus,
      iterations: coldIterations,
      maxDuration: '5m',
      startTime: `${2 * parseSeconds(duration)}s`,
      tags: { behaviour: 'report_trends_cold' },
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
  // Accounts with MFA cannot log in from k6: pass the session token instead
  // (browser: localStorage `service-desk.session` → accessToken, valid ~1 h).
  if (env.ACCESS_TOKEN) {
    return { token: env.ACCESS_TOKEN };
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
  // The cache key is built from the *bucket* keys (whole months), so shifting
  // `from`/`to` by days would hit the cache. Instead every iteration gets its
  // own 36-month window (shifted by whole months) × priority filter, a real
  // miss within the 10-minute TTL as long as iterations ≤ 120 per run.
  const slot = scenarioIteration();
  const shift = slot % 24;
  const priority = ['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][Math.floor(slot / 24) % 5];
  const today = new Date();
  const to = shift === 0 ? today : new Date(today.getFullYear(), today.getMonth() - shift + 1, 0);
  const from = new Date(to.getFullYear(), to.getMonth() - 35, 1);
  const query =
    `organizationalUnitId=${organizationalUnitId}&from=${day(from)}&to=${day(to)}&granularity=month` +
    (priority ? `&priority=${priority}` : '');
  const response = get(`/reports/trends?${query}`, data.token, 'reports.trends.cold');
  trendsColdDuration.add(response.timings.duration);
}

function scenarioIteration() {
  return exec.scenario.iterationInTest;
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
  const rate = (name) => (data.metrics[name] ? data.metrics[name].values.rate : undefined);
  const percent = (value) => (value === undefined ? 'n/a' : `${(value * 100).toFixed(2)} %`);
  lines.push('');
  lines.push(`http_req_failed: ${percent(rate('http_req_failed'))} · checks (200): ${percent(rate('checks'))}`);
  const markdown = `${lines.join('\n')}\n`;
  return {
    [`perf/results/${label}.json`]: JSON.stringify(data, null, 2),
    [`perf/results/${label}.md`]: markdown,
    stdout: markdown,
  };
}

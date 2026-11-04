import { perfConfig, smokeThresholds } from './config.js';
import { buildScenarioLoadShape } from './lib/load-shape.js';
import {
  setup as setupSession,
  browserDashboard as runBrowserDashboard,
  agentTicketFlow as runAgentTicketFlow,
  searchHeavy as runSearchHeavy,
  serviceCatalog as runServiceCatalog,
  websocketClients as runWebsocketClients,
} from './lib/scenarios.js';
import { buildSummaryOutputs } from './report.js';

/**
 * Smoke run: the existing 200 virtual users held for five minutes after a
 * 30-second ramp, plus 10 additive BA-10 service-catalog users. The ramp avoids
 * releasing every cold VU against shared CI services at once. Existing behaviours
 * are not reweighted; thresholds and the catalog read budget are unchanged.
 *
 *   k6 run perf/smoke.js
 *
 * Phase 4.2 adds the CI mode: `PERF_PROFILE=ci k6 run perf/smoke.js` uses the
 * relaxed, documented thresholds from `ciThresholds()` — the ones the pipeline in
 * `.github/workflows/perf-smoke.yml` blocks on.
 */

const smoke = perfConfig.load.smoke;
const smokeVus = {
  browserDashboard: Math.round(smoke.virtualUsers * 0.4),
  agentTicketFlow: Math.round(smoke.virtualUsers * 0.35),
  searchHeavy: Math.round(smoke.virtualUsers * 0.1),
  websocketClients: Math.round(smoke.virtualUsers * 0.15),
  serviceCatalog: smoke.serviceCatalogVirtualUsers,
};
const smokeReportConfig = {
  ...perfConfig,
  load: {
    ...perfConfig.load,
    virtualUsers: smoke.virtualUsers + smoke.serviceCatalogVirtualUsers,
  },
};

const rampUp = __ENV.RAMP_UP || '30s';

export const options = {
  discardResponseBodies: false,
  scenarios: {
    browser_dashboard: buildScenarioLoadShape({
      exec: 'browserDashboard',
      vus: smokeVus.browserDashboard,
      duration: smoke.duration,
      behaviour: 'browser_dashboard',
      rampUp,
    }),
    agent_ticket_flow: buildScenarioLoadShape({
      exec: 'agentTicketFlow',
      vus: smokeVus.agentTicketFlow,
      duration: smoke.duration,
      behaviour: 'agent_ticket_flow',
      rampUp,
    }),
    search_heavy: buildScenarioLoadShape({
      exec: 'searchHeavy',
      vus: smokeVus.searchHeavy,
      duration: smoke.duration,
      behaviour: 'search_heavy',
      rampUp,
    }),
    websocket_clients: buildScenarioLoadShape({
      exec: 'websocketClients',
      vus: smokeVus.websocketClients,
      duration: smoke.duration,
      behaviour: 'ws_clients',
      rampUp,
    }),
    service_catalog: buildScenarioLoadShape({
      exec: 'serviceCatalog',
      vus: smokeVus.serviceCatalog,
      duration: smoke.duration,
      behaviour: 'service_catalog',
      rampUp,
    }),
  },
  thresholds: smokeThresholds(perfConfig),
};

export function setup() {
  return setupSession(perfConfig);
}

/**
 * k6 calls a scenario's `exec` function with the `setup()` return value as its ONLY
 * argument (`fn(data)`) — it does not pass the config. The behaviours in
 * `lib/scenarios.js` take `(config, data)` so they stay runnable outside k6, and these
 * wrappers are the glue.
 *
 * Getting this wrong is not cosmetic: with `exec: 'browserDashboard'` pointing straight
 * at the behaviour, `data` was `undefined` and every virtual user threw
 * `TypeError: Cannot read property 'tokens' of undefined` — 10 million failed iterations
 * in five minutes and a 35-minute job. `perf/validate.js` now checks the arity of these
 * exports statically so it cannot come back unnoticed.
 */
export function browserDashboard(data) {
  return runBrowserDashboard(perfConfig, data);
}

export function agentTicketFlow(data) {
  return runAgentTicketFlow(perfConfig, data);
}

export function searchHeavy(data) {
  return runSearchHeavy(perfConfig, data);
}

export function serviceCatalog(data) {
  return runServiceCatalog(perfConfig, data);
}

export function websocketClients(data) {
  return runWebsocketClients(perfConfig, data);
}

export function handleSummary(data) {
  return buildSummaryOutputs(data, smokeReportConfig);
}

import { perfConfig, fullThresholds, scenarioVus } from './config.js';
import {
  setup as setupSession,
  browserDashboard as runBrowserDashboard,
  agentTicketFlow as runAgentTicketFlow,
  searchHeavy as runSearchHeavy,
  websocketClients as runWebsocketClients,
} from './lib/scenarios.js';
import { handleSummary } from './report.js';

/**
 * Full baseline run: 2.800 virtual users, 30 minutes, four behaviours
 * (plan §5.1). One command produces the phase artefact:
 *
 *   k6 run perf/full.js
 *
 * Results land in perf/results/<REPORT_LABEL>.{json,md}.
 */

const vus = scenarioVus(perfConfig);

export const options = {
  discardResponseBodies: false,
  scenarios: {
    browser_dashboard: {
      executor: 'constant-vus',
      exec: 'browserDashboard',
      vus: vus.browserDashboard,
      duration: perfConfig.load.duration,
      tags: { behaviour: 'browser_dashboard' },
    },
    agent_ticket_flow: {
      executor: 'constant-vus',
      exec: 'agentTicketFlow',
      vus: vus.agentTicketFlow,
      duration: perfConfig.load.duration,
      tags: { behaviour: 'agent_ticket_flow' },
    },
    search_heavy: {
      executor: 'constant-vus',
      exec: 'searchHeavy',
      vus: vus.searchHeavy,
      duration: perfConfig.load.duration,
      tags: { behaviour: 'search_heavy' },
    },
    websocket_clients: {
      executor: 'constant-vus',
      exec: 'websocketClients',
      vus: vus.websocketClients,
      duration: perfConfig.load.duration,
      tags: { behaviour: 'ws_clients' },
    },
  },
  thresholds: fullThresholds(perfConfig),
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

export function websocketClients(data) {
  return runWebsocketClients(perfConfig, data);
}

export { handleSummary };

import { perfConfig, fullThresholds, ciThresholds } from './config.js';
import { setup as setupSession } from './lib/scenarios.js';
import { handleSummary } from './report.js';

/**
 * Smoke run: 200 virtual users, 5 minutes. Same behaviours as `full.js`, short
 * enough for CI and for a laptop. Phase 0 uses it to prove the package works
 * before the long baseline is started.
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
};

export const options = {
  discardResponseBodies: false,
  scenarios: {
    browser_dashboard: {
      executor: 'constant-vus',
      exec: 'browserDashboard',
      vus: smokeVus.browserDashboard,
      duration: smoke.duration,
      tags: { behaviour: 'browser_dashboard' },
    },
    agent_ticket_flow: {
      executor: 'constant-vus',
      exec: 'agentTicketFlow',
      vus: smokeVus.agentTicketFlow,
      duration: smoke.duration,
      tags: { behaviour: 'agent_ticket_flow' },
    },
    search_heavy: {
      executor: 'constant-vus',
      exec: 'searchHeavy',
      vus: smokeVus.searchHeavy,
      duration: smoke.duration,
      tags: { behaviour: 'search_heavy' },
    },
    websocket_clients: {
      executor: 'constant-vus',
      exec: 'websocketClients',
      vus: smokeVus.websocketClients,
      duration: smoke.duration,
      tags: { behaviour: 'ws_clients' },
    },
  },
  thresholds:
    perfConfig.profile === 'ci' ? ciThresholds(perfConfig) : fullThresholds(perfConfig),
};

export function setup() {
  return setupSession(perfConfig);
}

export {
  browserDashboard,
  agentTicketFlow,
  searchHeavy,
  websocketClients,
} from './lib/scenarios.js';

export { handleSummary };

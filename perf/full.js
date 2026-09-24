import { perfConfig, fullThresholds, scenarioVus } from './config.js';
import { setup as setupSession } from './lib/scenarios.js';
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

export {
  browserDashboard,
  agentTicketFlow,
  searchHeavy,
  websocketClients,
} from './lib/scenarios.js';

export { handleSummary };

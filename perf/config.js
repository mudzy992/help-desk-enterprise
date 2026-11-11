/**
 * Phase 0 load-test parameters. Every knob lives here (or comes from the
 * environment) so no scenario hardcodes a URL, a rate or a budget.
 *
 * Environment overrides: BASE_URL, VU, DURATION, ACTIVE_RATIO, REPORT_LABEL,
 * AGENT_EMAIL/AGENT_PASSWORD, REQUESTER_EMAIL/REQUESTER_PASSWORD,
 * TICKET_IDS (comma separated), SEARCH_TERM.
 *
 * `__ENV` exists inside k6 only; the guard below lets plain Node import this
 * file for the sanity check in `perf/validate.js`.
 */

const env = typeof __ENV === 'undefined' ? {} : __ENV;
const baseUrl = env.BASE_URL || 'http://localhost:10001';

export const perfConfig = {
  baseUrl,
  websocketUrl: baseUrl.replace(/^http/, 'ws'),
  socketPath: '/socket.io/',
  reportLabel: env.REPORT_LABEL || 'baseline',
  resultsDir: 'perf/results',
  load: {
    // Registered users vs. concurrently active ones (plan §0.1).
    virtualUsers: Number(env.VU || 2800),
    activeRatio: Number(env.ACTIVE_RATIO || 0.7),
    duration: env.DURATION || '30m',
    thinkTimeSeconds: { min: 1, max: 4 },
    smoke: { virtualUsers: 200, duration: '5m' },
    // Share of the active pool per behaviour (plan §5.1).
    behaviourMix: {
      browserDashboard: 0.4,
      agentTicketFlow: 0.35,
      searchHeavy: 0.1,
      websocketClients: 0.15,
    },
  },
  credentials: {
    agent: {
      email: env.AGENT_EMAIL || 'agent.it@example.test',
      password: env.AGENT_PASSWORD || 'change-me',
    },
    requester: {
      email: env.REQUESTER_EMAIL || 'requester@example.test',
      password: env.REQUESTER_PASSWORD || 'change-me',
    },
  },
  paths: {
    login: '/auth/login',
    tickets: '/tickets',
    ticketInbox: '/tickets/inbox',
    ticketCounts: '/tickets/counts',
    unreadCount: '/notifications/unread-count',
    notifications: '/notifications',
    search: '/search',
    dashboardSummary: '/reports/dashboard/summary',
  },
  behaviour: {
    // One message every 30 s per virtual agent (plan §5.1).
    messageEverySeconds: 30,
    // One search per minute per search-heavy user (plan §5.1).
    searchEverySeconds: 60,
    searchTerm: env.SEARCH_TERM || 'vpn',
    // Ticket ids the WS scenario joins; empty = connect and listen only.
    ticketIds: (env.TICKET_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  },
  budgets: {
    // Plan §4.2 SLO table. CI runs relax the read budget on shared runners.
    readP95Ms: 200,
    mutationP95Ms: 400,
    errorRate: 0.005,
    dashboardPayloadKb: 100,
    searchRequestsPerInput: 1,
    ticketListPayloadKb: 100,
  },
  // Phase 4.2 (plan §4.2, item 1): the CI gate is a *smoke*, not the full run.
  // `PERF_PROFILE=ci` switches the durations to the short profile and the thresholds
  // to the relaxed numbers below (see `ciThresholds` for where each one comes from).
  profile: env.PERF_PROFILE || 'full',
};

/** Number of virtual users per scenario, derived from the mix above. */
export function scenarioVus(config) {
  const active = Math.round(config.load.virtualUsers * config.load.activeRatio);
  const mix = config.load.behaviourMix;
  return {
    browserDashboard: Math.max(1, Math.round(active * mix.browserDashboard)),
    agentTicketFlow: Math.max(1, Math.round(active * mix.agentTicketFlow)),
    searchHeavy: Math.max(1, Math.round(active * mix.searchHeavy)),
    websocketClients: Math.max(1, Math.round(active * mix.websocketClients)),
    active,
  };
}

/**
 * Phase 4.2 (plan §4.2, item 1): thresholds for the CI smoke step.
 *
 * Where the numbers come from — the rule is that a threshold is never invented:
 * - `http_req_failed < 1%`: the SLO budget is 0.5% (plan §4.2) with the documented
 *   CI margin of 2× for shared runners and cold JIT.
 * - read endpoints `p(95) < 500 ms`: this is the 200 ms SLO budget × 2.5, NOT a
 *   measurement. The honest state after Phase 3 is that `perf/results/after-f3-…`
 *   is a code finding (the sandbox had no k6/Postgres/Redis/LB), so there is no
 *   measured P95 to derive 1.5× from. The margin is deliberate and commented; the
 *   iron rule (budget = measured × 1.5) is applied on the first CI run that has real
 *   numbers, or by a human decision recorded in `PERF_BUDGETS.md`.
 * - mutation `p(95) < 1000 ms`: same reasoning, 400 ms budget × 2.5.
 * - payload budgets are measured by the scenarios themselves and stay at the SLO
 *   value: they do not depend on runner speed.
 */
export function ciThresholds(config) {
  const readP95Ms = config.budgets.readP95Ms * 2.5;
  const mutationP95Ms = config.budgets.mutationP95Ms * 2.5;
  const errorRate = config.budgets.errorRate * 2;
  return {
    // `abortOnFail`: once the error rate is past the gate there is nothing left to
    // measure, so the run stops in seconds instead of spinning out its whole duration.
    // Without it a broken `setup()` produced 10 million failed iterations in five
    // minutes and a 35-minute CI job (the k6 call convention bug found on 2026-09-24;
    // `perf/validate.js` now guards the arity statically).
    http_req_failed: [
      { threshold: `rate<${errorRate}`, abortOnFail: true, delayAbortEval: '10s' },
    ],
    tickets_list_duration: [`p(95)<${readP95Ms}`],
    ticket_detail_duration: [`p(95)<${readP95Ms}`],
    unread_count_duration: [`p(95)<${readP95Ms}`],
    search_duration: [`p(95)<${readP95Ms}`],
    dashboard_summary_duration: [`p(95)<${readP95Ms}`],
    ticket_message_duration: [`p(95)<${mutationP95Ms}`],
    ticket_list_payload_kb: [`p(95)<${config.budgets.ticketListPayloadKb}`],
    dashboard_payload_kb: [`p(95)<${config.budgets.dashboardPayloadKb}`],
  };
}

/** Threshold block for the full run; smoke.js overrides the durations. */
export function fullThresholds(config) {
  return {
    // Same reasoning as in `ciThresholds`, with a longer grace period: a 30-minute
    // baseline that is 100% errors is not a baseline.
    http_req_failed: [
      {
        threshold: `rate<${config.budgets.errorRate}`,
        abortOnFail: true,
        delayAbortEval: '30s',
      },
    ],
    tickets_list_duration: [`p(95)<${config.budgets.readP95Ms}`],
    ticket_detail_duration: [`p(95)<${config.budgets.readP95Ms}`],
    unread_count_duration: [`p(95)<${config.budgets.readP95Ms}`],
    search_duration: [`p(95)<${config.budgets.readP95Ms}`],
    ticket_message_duration: [`p(95)<${config.budgets.mutationP95Ms}`],
    ticket_list_payload_kb: [`p(95)<${config.budgets.ticketListPayloadKb}`],
  };
}

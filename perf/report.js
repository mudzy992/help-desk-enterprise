import { perfConfig } from './config.js';

/**
 * Turns a k6 summary into the two artefacts every phase leaves behind:
 * raw JSON (`perf/results/<label>.json`) and a markdown report
 * (`perf/results/<label>.md`) that can be pasted into the plan §7 table.
 *
 * No remote imports (k6-summary) on purpose: the load-test package must work in
 * an air-gapped CI runner as well.
 */

const endpointTrends = [
  ['tickets_list_duration', 'GET /tickets'],
  ['ticket_detail_duration', 'GET /tickets/:id'],
  ['ticket_message_duration', 'POST /tickets/:id/messages'],
  ['unread_count_duration', 'GET /notifications/unread-count'],
  ['search_duration', 'GET /search'],
  ['dashboard_summary_duration', 'GET /reports/*/summary'],
  ['ticket_list_payload_kb', 'GET /tickets payload (KB)'],
  ['dashboard_payload_kb', 'dashboard payload (KB)'],
];

const counters = [
  ['unread_count_requests', 'unread-count requests'],
  ['search_requests', 'search requests'],
  ['ws_events_received', 'WS events received'],
  ['ws_connect_errors', 'WS connect errors'],
  ['http_reqs', 'HTTP requests'],
];

export function handleSummary(data) {
  return buildSummaryOutputs(data, perfConfig);
}

export function buildSummaryOutputs(data, config) {
  const label = config.reportLabel;
  const directory = config.resultsDir;
  return {
    [`${directory}/${label}.json`]: JSON.stringify(data, null, 2),
    [`${directory}/${label}.md`]: renderMarkdown(data, config),
    stdout: renderConsole(data, config),
  };
}

export function renderMarkdown(data, config) {
  const lines = [];
  const durationSeconds = Math.round(readNumber(data, 'state.testRunDurationMs') / 1000);
  lines.push(`# Load test — ${config.reportLabel}`);
  lines.push('');
  lines.push(
    `Run: ${config.load.virtualUsers} VU configured, ${durationSeconds}s wall clock, base URL \`${config.baseUrl}\`.`,
  );
  lines.push('');
  lines.push('| Metric | p50 | p95 | p99 | max |');
  lines.push('|---|---|---|---|---|');
  for (const [name, description] of endpointTrends) {
    const metric = data.metrics[name];
    if (metric === undefined || metric.values === undefined) {
      continue;
    }
    lines.push(
      `| ${description} | ${format(metric.values['p(50)'])} | ${format(metric.values['p(95)'])} | ${format(metric.values['p(99)'])} | ${format(metric.values.max)} |`,
    );
  }
  lines.push('');
  lines.push('| Counter | Value |');
  lines.push('|---|---|');
  for (const [name, description] of counters) {
    const metric = data.metrics[name];
    if (metric === undefined || metric.values === undefined) {
      continue;
    }
    lines.push(`| ${description} | ${format(metric.values.count ?? metric.values.rate)} |`);
  }
  const wsClients = data.metrics.ws_clients;
  if (wsClients !== undefined && wsClients.values !== undefined) {
    lines.push(`| WS clients (max) | ${format(wsClients.values.max)} |`);
  }
  lines.push('');
  lines.push('| Threshold | Result |');
  lines.push('|---|---|');
  for (const [name, metric] of Object.entries(data.metrics)) {
    if (metric.thresholds === undefined) {
      continue;
    }
    for (const [expression, threshold] of Object.entries(metric.thresholds)) {
      lines.push(`| ${name}: ${expression} | ${threshold.ok ? 'ok' : 'FAILED'} |`);
    }
  }
  lines.push('');
  lines.push('## Budgets from the plan (§4.2)');
  lines.push('');
  lines.push('| Budget | Value |');
  lines.push('|---|---|');
  lines.push(`| P95 read endpoint | < ${config.budgets.readP95Ms} ms |`);
  lines.push(`| P95 mutation | < ${config.budgets.mutationP95Ms} ms |`);
  lines.push(`| Error rate | < ${config.budgets.errorRate * 100}% |`);
  lines.push(`| Ticket list payload | < ${config.budgets.ticketListPayloadKb} KB |`);
  lines.push(`| Dashboard payload | < ${config.budgets.dashboardPayloadKb} KB |`);
  lines.push('');
  lines.push('Database side of the same run: attach `ops/sql/snapshot_db_stats.sql` output.');
  lines.push('');
  return lines.join('\n');
}

/** Short stdout block; k6 still prints its own summary afterwards. */
export function renderConsole(data, config) {
  const lines = [`perf: ${config.reportLabel}`];
  for (const [name, description] of endpointTrends) {
    const metric = data.metrics[name];
    if (metric === undefined || metric.values === undefined) {
      continue;
    }
    lines.push(
      `  ${description}: p95=${format(metric.values['p(95)'])} p99=${format(metric.values['p(99)'])}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function format(value) {
  if (value === undefined || value === null) {
    return '-';
  }
  if (typeof value !== 'number') {
    return String(value);
  }
  return value.toFixed(2);
}

function readNumber(data, path) {
  const value = path.split('.').reduce((current, key) => {
    if (current === undefined || current === null) {
      return undefined;
    }
    return current[key];
  }, data);
  return typeof value === 'number' ? value : 0;
}

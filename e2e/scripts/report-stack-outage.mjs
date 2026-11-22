/*
  Nightly run 44999494543 (2026-11-22) reported itself as a red `E2E critical flows`
  job although Playwright finished green: 124 passed, 0 failed, 3 flaky, 1 skipped.
  The failing step was this one — "Report the stack probe timeline" — and the reason
  was not the stack: the shell snippet expanded `$E2E_API_URL` under `set -u` while
  that variable only exists in *other* steps' `env:`. The step therefore crashed with
  `E2E_API_URL: unbound variable` exactly when there was an outage to report, so an
  infrastructure flap was published as a product failure.

  Two rules follow from that:

  1. The reporter must never be able to fail the job. It reads the timeline that
     `scripts/run-e2e.mjs` wrote, prints it, and exits 0 — always, also when the
     artifact is missing or unreadable.
  2. It must name the API from the report itself (`stack-watch.json` carries
     `apiUrl`), never from a variable that some step happens to define.

  Severity is deliberate: an outage that the watchdog did **not** stop the run for
  is a warning (the tests still decided the outcome), an outage that stopped the
  run is an error (the run is already red and this annotation explains why).

  This file is pure data-in/text-out so `report-stack-outage.test.mjs` can cover it
  offline; the e2e job runs that test in "Test the JSON summarizer and the stack
  watchdog".
*/

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** One line for the log plus the fields the annotation needs. */
export function summarizeWatch(report) {
  const probes = Array.isArray(report?.probes) ? report.probes : [];
  const outage = report?.outage ?? null;
  const failedProbes = probes.filter((probe) => probe?.ok === false).length;
  const episodes = countEpisodes(probes);
  const apiUrl =
    typeof report?.apiUrl === 'string' && report.apiUrl.length > 0
      ? report.apiUrl
      : 'the configured API';
  return {
    apiUrl,
    aborted: report?.aborted === true,
    threshold: report?.threshold ?? null,
    intervalMs: report?.intervalMs ?? null,
    probes: probes.length,
    failedProbes,
    episodes,
    outage:
      outage === null
        ? null
        : {
            firstAt: outage.firstAt ?? null,
            lastAt: outage.lastAt ?? null,
            recovered: outage.recovered === true,
          },
  };
}

/**
 * A failing streak per `ok:true -> ok:false` transition. The watchdog aborts only
 * after `threshold` *consecutive* failures, so several short streaks are a flapping
 * stack that never tripped it — exactly what run 44999494543 recorded (4 warnings,
 * no abort, one 17-minute window in `outage`).
 */
export function countEpisodes(probes) {
  let episodes = 0;
  let failing = false;
  for (const probe of probes) {
    const failed = probe?.ok === false;
    if (failed && !failing) episodes += 1;
    failing = failed;
  }
  return episodes;
}

/** `null` when the stack stayed healthy: nothing to annotate. */
export function outageAnnotation(summary) {
  if (summary.outage === null) return null;
  const window = `${summary.outage.firstAt ?? 'unknown'} to ${summary.outage.lastAt ?? 'unknown'}`;
  const failureDescription =
    `${summary.failedProbes} of the last ${summary.probes} ` +
    `GET ${summary.apiUrl}/health probes failed in ${summary.episodes} ` +
    `${summary.episodes === 1 ? 'episode' : 'episodes'}`;
  if (summary.aborted) {
    return {
      level: 'error',
      title: 'E2E stack unavailable (infrastructure, not a code regression)',
      message:
        `${failureDescription} (${window}). The stack watchdog stopped the run after ` +
        `${summary.threshold ?? 'the configured'} consecutive failures, so the remaining ` +
        'tests never ran. Match the window against the deploy/restart history of the ' +
        'stack, then re-run: Actions -> CI -> Run workflow.',
    };
  }
  return {
    level: 'warning',
    title: 'E2E stack outage (infrastructure, not a code regression)',
    message:
      `${failureDescription} (${window}); the stack answered again before the job ended ` +
      `(recovered: ${summary.outage.recovered}, run stopped by the watchdog: ` +
      `${summary.aborted}). The tests still decided this job: failures marked [stack] ` +
      'or [stack-suspect] in the summary and flaky results inside the window describe ' +
      'the outage, not the product. Match the window against the deploy/restart history ' +
      'of the stack before treating anything as a regression.',
  };
}

/** Markdown for `$GITHUB_STEP_SUMMARY` so the timeline is on the run page, not only in the log. */
export function renderSummary(summary) {
  const lines = ['### E2E stack probe timeline', '', '| Field | Value |', '| --- | --- |'];
  lines.push(`| API | ${summary.apiUrl} |`);
  lines.push(`| Probes kept | ${summary.probes} |`);
  lines.push(`| Failed probes | ${summary.failedProbes} |`);
  lines.push(`| Failure episodes | ${summary.episodes} |`);
  lines.push(`| Consecutive-failure threshold | ${summary.threshold ?? 'n/a'} |`);
  lines.push(`| Probe interval | ${summary.intervalMs ?? 'n/a'} ms |`);
  lines.push(`| Run stopped by the watchdog | ${summary.aborted} |`);
  if (summary.outage === null) {
    lines.push('| Outage | none — the API answered every probe |');
  } else {
    lines.push(
      `| Outage window | ${summary.outage.firstAt ?? 'unknown'} to ${summary.outage.lastAt ?? 'unknown'} |`,
    );
    lines.push(`| Recovered before the job ended | ${summary.outage.recovered} |`);
  }
  return `${lines.join('\n')}\n`;
}

/** Everything the CLI prints, so a test can assert on the exact output without spawning. */
export function renderReport(summary) {
  const lines = [
    `stack-watch.json: ${JSON.stringify({
      apiUrl: summary.apiUrl,
      aborted: summary.aborted,
      threshold: summary.threshold,
      intervalMs: summary.intervalMs,
      probes: summary.probes,
      failedProbes: summary.failedProbes,
      episodes: summary.episodes,
      outage: summary.outage,
    })}`,
  ];
  const annotation = outageAnnotation(summary);
  if (annotation !== null) {
    lines.push(`::${annotation.level} title=${annotation.title}::${annotation.message}`);
  }
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const reportPath = argv[2] ?? 'stack-watch.json';
  if (!existsSync(reportPath)) {
    process.stdout.write(
      `No ${reportPath} — this run did not go through scripts/run-e2e.mjs (or E2E_API_URL ` +
        'is empty), so no probe timeline exists.\n',
    );
    return 0;
  }
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (error) {
    // An unreadable artifact must not turn a green run red; say so and move on.
    process.stdout.write(
      `::warning title=E2E stack probe timeline unreadable::${reportPath} could not be parsed ` +
        `(${String(error)}) — the probe timeline is unknown for this run, the test result is not.\n`,
    );
    return 0;
  }
  const summary = summarizeWatch(report);
  process.stdout.write(renderReport(summary));
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (typeof stepSummary === 'string' && stepSummary.length > 0) {
    try {
      appendFileSync(stepSummary, renderSummary(summary), 'utf8');
    } catch (error) {
      process.stdout.write(`[e2e] could not append to GITHUB_STEP_SUMMARY: ${String(error)}\n`);
    }
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  process.exitCode = main(process.argv);
}

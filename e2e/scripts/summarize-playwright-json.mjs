/*
  CI triage (2026-10-05): the e2e job ran 70 specs for the first time and the
  failures were only visible as `list` output, because the HTML report was never
  uploaded as an artifact. This script turns the Playwright JSON report into one
  compact block per failure so the reason is in the job log itself.

  Usage (inside the e2e working directory, in CI):
    PLAYWRIGHT_JSON_OUTPUT_NAME=results.json npx playwright test --reporter=list,json
    node scripts/summarize-playwright-json.mjs results.json
*/

import { readFileSync } from 'node:fs';

/*
  Nightly run 44049572740 (2026-11-17): 18 red tests, of which 13 were nothing
  but the reverse proxy answering its own HTML page ("Site not available",
  HTTP 503) because the stack behind it was restarting. Read as plain FAIL lines
  they look like 18 product regressions. The classifier below separates the two:
  a failure whose message carries a gateway/an HTML body/network unreachable
  signature is an *outage*, and a timeout that ran while `stack-watch.json`
  (written by `scripts/run-e2e.mjs`) recorded failed health probes is an outage
  *suspect*. Everything else stays a product failure. The classification never
  turns a job green — it only tells the reader which half of the run to fix.
*/
export const STACK_FAILURE_SIGNATURES = [
  /\bHTTP_50[234]\b/,
  /\bSTACK_UNAVAILABLE\b/,
  /Site not available/i,
  /Unexpected token '<'/,
  /was not reachable from the runner/,
  /\b(ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH)\b/,
  /\bUND_ERR_[A-Z_]+\b/,
  /net::ERR_(CONNECTION|NAME_NOT_RESOLVED|TIMED_OUT|EMPTY_RESPONSE|HTTP_RESPONSE_CODE_FAILURE)/,
];

/** `'stack'` | `'stack-suspect'` | `'product'` — see STACK_FAILURE_SIGNATURES. */
export function classifyFailure(failure, { stackOutage = false } = {}) {
  const text = [failure?.error ?? '', ...(failure?.detail ?? [])].join('\n');
  if (STACK_FAILURE_SIGNATURES.some((pattern) => pattern.test(text))) return 'stack';
  if (stackOutage && (failure?.status === 'timedOut' || /timeout of \d+ms exceeded/i.test(text))) {
    return 'stack-suspect';
  }
  return 'product';
}

/** Tolerant read of the watchdog report; a missing or broken file is `null`. */
export function readStackWatch(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed !== null && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * A `stack-watch.json` left over from an earlier run must not colour this one:
 * the file is generated per run, so its own `startedAt` has to sit close to the
 * report's `stats.startTime`. Missing timestamps are trusted (an older report).
 */
export function isFreshWatch(watch, report) {
  const watchStart = Date.parse(watch?.startedAt ?? '');
  const reportStart = Date.parse(report?.stats?.startTime ?? '');
  if (!Number.isFinite(watchStart) || !Number.isFinite(reportStart)) return true;
  return Math.abs(watchStart - reportStart) < 6 * 60 * 60 * 1_000;
}

/** The outage window in the watchdog report, or `null` when the stack stayed up. */
export function stackOutageWindow(watch) {
  const outage = watch?.outage;
  if (outage === null || outage === undefined || typeof outage.firstAt !== 'string') return null;
  return {
    firstAt: outage.firstAt,
    lastAt: typeof outage.lastAt === 'string' ? outage.lastAt : outage.firstAt,
    recovered: outage.recovered === true,
    aborted: watch?.aborted === true,
    apiUrl: typeof watch?.apiUrl === 'string' && watch.apiUrl.length > 0 ? watch.apiUrl : null,
  };
}

/** First line of the first failure of one test, without ANSI codes and paths noise. */
export function firstErrorLine(error) {
  if (error === undefined || error === null) return '(no error message)';
  const message = typeof error === 'string' ? error : (error.message ?? String(error));
  const clean = message
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  return clean[0] ?? '(empty error message)';
}

/**
 * First real e2e run (2026-10-05): the log carried only the first line of each
 * failure, which was enough for `expect(received).toMatch(expected)` and
 * `Error: INVALID_SLUG` but not for the questions that mattered — *what* was
 * received, *which* axe rule fired, *why* `fetch failed`. The detail lines hold
 * exactly that (Playwright puts `Expected string` / `Received string`, the axe
 * violation list and the wrapped `cause` there).
 */
export function errorDetail(error, maxLines = 15) {
  if (error === undefined || error === null) return [];
  const message = typeof error === 'string' ? error : (error.message ?? String(error));
  const clean = message
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const rest = clean.slice(1, maxLines + 1);
  const hidden = clean.length - 1 - rest.length;
  const detail = rest.map((line) => `       ${line.length > 300 ? `${line.slice(0, 297)}…` : line}`);
  if (hidden > 0) detail.push(`       … ${hidden} more line(s) — see the artifact (results.json / playwright-report).`);
  return detail;
}

/**
 * Triage helper (2026-10-05): the workflow can re-run only the files that failed
 * (`workflow_dispatch` input `specs=10,18,22`, ~2 min instead of ~35). The summary
 * prints that line ready to copy, so nobody has to count numbers by hand.
 */
export function triageSpecNumbers(failures) {
  const numbers = new Set();
  for (const failure of failures) {
    const match = /^(\d+)-/.exec(failure.file ?? '');
    if (match) numbers.add(match[1]);
  }
  return [...numbers].sort((left, right) => Number(left) - Number(right));
}

/** Skipped specs, so a `test.skip(...)` never hides inside a green run. */
export function collectSkipped(report) {
  const skipped = [];
  const walk = (suite, trail) => {
    const titles = suite.title === '' ? trail : [...trail, suite.title];
    for (const spec of suite.specs ?? []) {
      const testTitles = [...titles, spec.title];
      for (const test of spec.tests ?? []) {
        if ((test.results ?? []).some((result) => result.status === 'skipped')) {
          skipped.push(testTitles.filter((part) => part.length > 0).join(' › '));
        }
      }
    }
    for (const child of suite.suites ?? []) walk(child, titles);
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return skipped;
}

/**
 * Only tests that remain unexpected after all configured retries:
 * `{ file, line, title, status, error }`.
 */
export function collectFailures(report) {
  const failures = [];
  const walk = (suite, trail) => {
    const file = suite.file ?? null;
    const titles = suite.title === '' ? trail : [...trail, suite.title];
    for (const spec of suite.specs ?? []) {
      const testTitles = [...titles, spec.title];
      for (const test of spec.tests ?? []) {
        // Playwright marks tests that pass on retry as `flaky`; their failed
        // attempts are not final failures and must not be reported as `FAIL`.
        if (test.status !== undefined && test.status !== 'unexpected') continue;
        const failed = (test.results ?? []).filter(
          (result) => result.status === 'failed' || result.status === 'timedOut',
        );
        if (failed.length === 0) continue;
        const last = failed[failed.length - 1];
        failures.push({
          file: file === null ? '(unknown file)' : file.replace(/^.*[\\/]/, ''),
          line: spec.line ?? 0,
          title: testTitles.filter((part) => part.length > 0).join(' › '),
          status: last.status,
          retries: failed.length - 1,
          error: firstErrorLine(last.error),
          detail: errorDetail(last.error),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, titles);
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return failures;
}

/** Tests that had a failed attempt but passed on retry; kept separate from failures. */
export function collectFlaky(report) {
  const flaky = [];
  const walk = (suite, trail) => {
    const file = suite.file ?? null;
    const titles = suite.title === '' ? trail : [...trail, suite.title];
    for (const spec of suite.specs ?? []) {
      const testTitles = [...titles, spec.title];
      for (const test of spec.tests ?? []) {
        if (test.status !== 'flaky') continue;
        const failed = (test.results ?? []).filter(
          (result) => result.status === 'failed' || result.status === 'timedOut',
        );
        if (failed.length === 0) continue;
        flaky.push({
          file: file === null ? '(unknown file)' : file.replace(/^.*[\\/]/, ''),
          line: spec.line ?? 0,
          title: testTitles.filter((part) => part.length > 0).join(' › '),
          retries: failed.length,
          error: firstErrorLine(failed[0].error),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, titles);
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return flaky;
}

/**
 * The block that keeps an outage from reading as 18 product regressions: the
 * health-probe window, how many failures it explains, and what to do instead of
 * touching the code.
 */
export function stackOutageLines(stackOutage, failures) {
  const stack = failures.filter((failure) => failure.kind === 'stack');
  const suspect = failures.filter((failure) => failure.kind === 'stack-suspect');
  const lines = ['STACK OUTAGE — infrastructure, not a code regression.'];
  if (stackOutage === null) {
    lines.push(
      '  No stack-watch.json for this run (Playwright was not started through scripts/run-e2e.mjs), ' +
        "so the outage window is unknown — the messages below are the hosting layer's own answer.",
    );
  } else {
    const duration = Math.max(0, Date.parse(stackOutage.lastAt) - Date.parse(stackOutage.firstAt));
    const minutes = Math.round(duration / 60_000);
    lines.push(
      `  GET ${stackOutage.apiUrl ?? '$E2E_API_URL'}/health failed from ${stackOutage.firstAt} to ` +
        `${stackOutage.lastAt} (${minutes >= 1 ? `${minutes} min` : `${duration} ms`}); ` +
        `recovered before the job ended: ${stackOutage.recovered ? 'yes' : 'no'}.`,
    );
  }
  if (stackOutage?.aborted === true) {
    lines.push('  Playwright was stopped by the stack watchdog (scripts/run-e2e.mjs) — the rest of the suite did not run.');
  }
  if (stack.length > 0) {
    lines.push(`  ${stack.length} failure(s) carry the hosting layer's error page or an unreachable API.`);
  }
  if (suspect.length > 0) {
    const where = suspect.map((failure) => `${failure.file}:${failure.line}`).join(', ');
    lines.push(`  ${suspect.length} further failure(s) timed out inside that window and are probably the same outage: ${where}.`);
  }
  if (stack.length === 0 && suspect.length === 0) {
    lines.push(
      stackOutage === null
        ? '  No test failed for an infrastructure reason.'
        : '  No test failed in that window, but flaky results inside it are explained by it.',
    );
  } else {
    lines.push(
      '  No code change is implied: wait until $E2E_API_URL/health answers 200 with {"status":"ok"}, ' +
        'check the stack\'s deploy/restart history for that interval, then re-run the same specs.',
    );
  }
  return lines;
}

/** Grouped, human-readable summary; also usable as a plain string. */
export function formatSummary(report, fileName = 'results.json', options = {}) {
  const stackOutage = options.stackOutage ?? null;
  const failures = collectFailures(report).map((failure) => ({
    ...failure,
    kind: classifyFailure(failure, { stackOutage: stackOutage !== null }),
  }));
  const flakyTests = collectFlaky(report);
  const skippedTitles = collectSkipped(report);
  const stats = report.stats ?? {};
  const lines = [];
  const total = stats.expected ?? 0;
  const unexpected = stats.unexpected ?? 0;
  const flaky = stats.flaky ?? 0;
  const skipped = stats.skipped ?? 0;
  lines.push(`Playwright (${fileName}): ${total} passed, ${unexpected} failed, ${flaky} flaky, ${skipped} skipped.`);
  const hasInfrastructureFailures = failures.some((failure) => failure.kind !== 'product');
  if (stackOutage !== null || hasInfrastructureFailures) {
    lines.push('');
    lines.push(...stackOutageLines(stackOutage, failures));
  }
  if (failures.length === 0) {
    lines.push(
      flakyTests.length === 0
        ? 'No failures: every executed spec passed on the first try.'
        : `No unexpected failures; ${flakyTests.length} flaky test(s) recovered on retry.`,
    );
  } else {
    lines.push('');
    // Keep every final failing test visible in the first CI annotations. A single
    // error line can contain a whole API response, so cap it and print details later.
    for (const failure of failures) {
      const retryNote = failure.retries > 0 ? ` (after ${failure.retries} retry/retries)` : '';
      const kindTag =
        failure.kind === 'stack' ? '  [stack]' : failure.kind === 'stack-suspect' ? '  [stack-suspect]' : '';
      lines.push(`FAIL ${failure.file}:${failure.line} — ${failure.title}${retryNote}${kindTag}`);
      const firstLine = failure.error.length > 500 ? `${failure.error.slice(0, 499)}…` : failure.error;
      lines.push(`     ${firstLine}`);
    }
    const failuresWithDetails = failures.filter((failure) => (failure.detail ?? []).length > 0);
    if (failuresWithDetails.length > 0) {
      lines.push('');
      lines.push('Failure detail excerpts:');
      for (const failure of failuresWithDetails) {
        lines.push(`DETAIL ${failure.file}:${failure.line}`);
        for (const line of failure.detail ?? []) lines.push(line);
      }
    }
    // A stack failure needs a healthy stack, not a triage run — never point the
    // operator at a spec file that only saw the proxy's error page.
    const triage = triageSpecNumbers(failures.filter((failure) => failure.kind === 'product'));
    if (triage.length > 0 && triage.length < 36) {
      lines.push('');
      lines.push(
        `NEXT TRIAGE RUN: specs=${triage.join(',')} (Actions → CI → Run workflow, max_failures=8, retries=0)`,
      );
    }
  }
  if (flakyTests.length > 0) {
    lines.push('');
    lines.push(`FLAKY ${flakyTests.length} test(s) passed on retry; separate from final failures:`);
    for (const item of flakyTests) {
      lines.push(`FLAKY ${item.file}:${item.line} — ${item.title}`);
      lines.push(`     ${item.error}`);
    }
  }
  if (skippedTitles.length > 0) {
    lines.push('');
    lines.push(`SKIPPED ${skippedTitles.length} test(s) — a skip is not a pass:`);
    for (const title of skippedTitles) lines.push(`     ${title}`);
  }
  return lines.join('\n');
}

function main() {
  const path = process.argv[2] ?? 'results.json';
  // The watchdog report (`scripts/run-e2e.mjs`) turns timeouts inside an outage
  // window from "product failure" into "probably the same outage".
  const watchPath =
    process.argv[3] ?? process.env.E2E_STACK_WATCH_FILE ?? 'stack-watch.json';
  const watch = readStackWatch(watchPath);
  let report;
  try {
    report = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    const stackOutage = stackOutageWindow(watch);
    console.log(`[e2e-triage] could not read ${path}: ${error instanceof Error ? error.message : String(error)}`);
    if (stackOutage !== null) {
      // A watchdog-aborted run may leave no results.json at all; the outage is
      // then the whole story and must still reach the log.
      console.log('');
      console.log(stackOutageLines(stackOutage, []).join('\n'));
    }
    return 0;
  }
  console.log(
    formatSummary(report, path, {
      stackOutage: stackOutageWindow(isFreshWatch(watch, report) ? watch : null),
    }),
  );
  return 0;
}


if (process.argv[1] !== undefined && process.argv[1].endsWith('summarize-playwright-json.mjs')) {
  process.exit(main());
}

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

/** Grouped, human-readable summary; also usable as a plain string. */
export function formatSummary(report, fileName = 'results.json') {
  const failures = collectFailures(report);
  const flakyTests = collectFlaky(report);
  const skippedTitles = collectSkipped(report);
  const stats = report.stats ?? {};
  const lines = [];
  const total = stats.expected ?? 0;
  const unexpected = stats.unexpected ?? 0;
  const flaky = stats.flaky ?? 0;
  const skipped = stats.skipped ?? 0;
  lines.push(`Playwright (${fileName}): ${total} passed, ${unexpected} failed, ${flaky} flaky, ${skipped} skipped.`);
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
      lines.push(`FAIL ${failure.file}:${failure.line} — ${failure.title}${retryNote}`);
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
    const triage = triageSpecNumbers(failures);
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
  let report;
  try {
    report = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.log(`[e2e-triage] could not read ${path}: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
  console.log(formatSummary(report, path));
  return 0;
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('summarize-playwright-json.mjs')) {
  process.exit(main());
}

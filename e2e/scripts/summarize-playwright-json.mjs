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
 * Every failed test in the report, flattened:
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
        const results = test.results ?? [];
        const failed = results.filter((result) => result.status === 'failed' || result.status === 'timedOut');
        if (failed.length === 0) continue;
        const last = failed[failed.length - 1];
        failures.push({
          file: file === null ? '(unknown file)' : file.replace(/^.*[\\/]/, ''),
          line: spec.line ?? 0,
          title: testTitles.filter((part) => part.length > 0).join(' › '),
          status: last.status,
          retries: failed.length - 1,
          error: firstErrorLine(last.error),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, titles);
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return failures;
}

/** Grouped, human-readable summary; also usable as a plain string. */
export function formatSummary(report, fileName = 'results.json') {
  const failures = collectFailures(report);
  const stats = report.stats ?? {};
  const lines = [];
  const total = stats.expected ?? 0;
  const unexpected = stats.unexpected ?? 0;
  const flaky = stats.flaky ?? 0;
  const skipped = stats.skipped ?? 0;
  lines.push(`Playwright (${fileName}): ${total} passed, ${unexpected} failed, ${flaky} flaky, ${skipped} skipped.`);
  if (failures.length === 0) {
    lines.push('No failures: every executed spec passed on the first try.');
    return lines.join('\n');
  }
  lines.push('');
  for (const failure of failures) {
    const retryNote = failure.retries > 0 ? ` (after ${failure.retries} retry/retries)` : '';
    lines.push(`FAIL ${failure.file}:${failure.line} — ${failure.title}${retryNote}`);
    lines.push(`     ${failure.error}`);
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

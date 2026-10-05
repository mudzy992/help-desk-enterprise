import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectFailures,
  firstErrorLine,
  formatSummary,
} from './summarize-playwright-json.mjs';

function reportWith({ specs }) {
  return {
    stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0 },
    suites: [
      {
        title: '20 privacy',
        file: '/home/runner/work/repo/e2e/tests/20-privacy.spec.ts',
        specs,
      },
    ],
  };
}

const failedSpec = (title, line, message, attempts = 1) => ({
  title,
  line,
  tests: [
    {
      results: Array.from({ length: attempts }, () => ({
        status: 'failed',
        error: { message },
      })),
    },
  ],
});

const passedSpec = (title) => ({
  title,
  line: 1,
  tests: [{ results: [{ status: 'passed' }] }],
});

test('firstErrorLine strips ANSI codes and keeps the first line', () => {
  const message = '\u001b[31mError: expect(received).toBe(expected)\u001b[0m\n\nExpected: 200\nReceived: 403';
  assert.equal(firstErrorLine({ message }), 'Error: expect(received).toBe(expected)');
});

test('firstErrorLine survives missing and empty errors', () => {
  assert.equal(firstErrorLine(undefined), '(no error message)');
  assert.equal(firstErrorLine({ message: '' }), '(empty error message)');
});

test('collectFailures skips passing specs and keeps retries', () => {
  const report = reportWith({
    specs: [
      failedSpec('a DSR travels the timeline', 41, 'boom', 2),
      passedSpec('retention preview'),
    ],
  });
  const failures = collectFailures(report);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].file, '20-privacy.spec.ts');
  assert.equal(failures[0].line, 41);
  assert.equal(failures[0].title, '20 privacy › a DSR travels the timeline');
  assert.equal(failures[0].retries, 1);
});

test('formatSummary reports a clean run without a failure list', () => {
  const text = formatSummary(
    { stats: { expected: 70, unexpected: 0, flaky: 1, skipped: 0 }, suites: [] },
    'results.json',
  );
  assert.match(text, /70 passed, 0 failed, 1 flaky, 0 skipped/);
  assert.match(text, /No failures/);
});

test('formatSummary lists every failure with file and first error line', () => {
  const text = formatSummary(
    reportWith({
      specs: [failedSpec('a DSR travels the timeline', 41, 'Error: expected 200, received 403')],
    }),
  );
  assert.match(text, /FAIL 20-privacy\.spec\.ts:41 — 20 privacy › a DSR travels the timeline/);
  assert.match(text, /Error: expected 200, received 403/);
});

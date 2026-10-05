import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectFailures,
  collectSkipped,
  errorDetail,
  firstErrorLine,
  formatSummary,
  triageSpecNumbers,
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

const skippedSpec = (title) => ({
  title,
  line: 1,
  tests: [{ results: [{ status: 'skipped' }] }],
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

test('errorDetail keeps the lines that explain the failure', () => {
  const message = [
    'Error: expect(received).toMatch(expected)',
    '',
    'Expected pattern: /^\[HD-2026-000123\] /',
    'Received string:  "[HD-2026-000124] Nova poruka"',
  ].join('\n');
  const detail = errorDetail({ message });
  assert.equal(detail.length, 2);
  assert.match(detail[0], /Expected pattern/);
  assert.match(detail[1], /Received string/);
});

test('errorDetail bounds long output and says where the rest is', () => {
  const message = ['Error: axe', ...Array.from({ length: 40 }, (_, index) => `  serious rule-${index}`)].join('\n');
  const detail = errorDetail({ message }, 5);
  assert.equal(detail.length, 6);
  assert.match(detail.at(-1), /35 more line\(s\)/);
});

test('errorDetail survives missing errors', () => {
  assert.deepEqual(errorDetail(undefined), []);
  assert.deepEqual(errorDetail({ message: '' }), []);
});

test('formatSummary prints detail lines and never hides a skip', () => {
  const text = formatSummary(
    reportWith({
      specs: [
        failedSpec(
          'API: preview hides confidential data',
          33,
          'Error: expect(received).toMatch(expected)\nExpected pattern: /^\[HD-2026-000123\] /\nReceived string: "[HD-2026-000124]"',
        ),
        skippedSpec('send test to me (e-mail channel disabled)'),
      ],
    }),
  );
  assert.match(text, /FAIL 20-privacy\.spec\.ts:33/);
  assert.ok(text.includes('Expected pattern: /^[HD-2026-000123] /'), text);
  assert.ok(text.includes('Received string: "[HD-2026-000124]"'), text);
  assert.match(text, /SKIPPED 1 test\(s\) — a skip is not a pass:/);
  assert.match(text, /send test to me \(e-mail channel disabled\)/);
});

test('collectSkipped lists every skipped test with its suite trail', () => {
  const skipped = collectSkipped(
    reportWith({ specs: [passedSpec('fine'), skippedSpec('needs SMTP')] }),
  );
  assert.deepEqual(skipped, ['20 privacy › needs SMTP']);
});

test('triageSpecNumbers lists the failing spec files once, in numeric order', () => {
  assert.deepEqual(
    triageSpecNumbers([
      { file: '22-accessibility.spec.ts' },
      { file: '10-forward-cross-ou.spec.ts' },
      { file: '22-accessibility.spec.ts' },
      { file: 'install.setup.ts' },
    ]),
    ['10', '22'],
  );
  assert.deepEqual(triageSpecNumbers([]), []);
});

test('formatSummary prints the ready-to-copy triage dispatch line', () => {
  const text = formatSummary(
    reportWith({ specs: [failedSpec('a', 1, 'boom'), failedSpec('b', 2, 'boom'), failedSpec('c', 3, 'boom')] }),
  );
  assert.match(text, /NEXT TRIAGE RUN: specs=20 /);
});

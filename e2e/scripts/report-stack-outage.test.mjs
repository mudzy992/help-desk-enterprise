/*
  Offline cover for `report-stack-outage.mjs`.

  Nightly run 44999494543 (2026-11-22) went red on the reporting step, not on the
  tests: `set -u` plus an `$E2E_API_URL` that only other steps defined produced
  `E2E_API_URL: unbound variable`, so a 17-minute stack flap was published as a
  product failure while Playwright had 124 passed / 0 failed. These cases pin the
  two rules that keep that from happening again: the reporter always exits 0, and
  an outage is an *error* only when the watchdog actually stopped the run.
*/

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  countEpisodes,
  outageAnnotation,
  renderReport,
  renderSummary,
  summarizeWatch,
} from './report-stack-outage.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'report-stack-outage.mjs');

function healthyProbe(at) {
  return { at, ok: true, httpStatus: 200, proxyPage: false, title: null, error: null };
}

function failedProbe(at) {
  return { at, ok: false, httpStatus: 503, proxyPage: true, title: 'Site not available', error: null };
}

function report(overrides = {}) {
  return {
    startedAt: '2026-11-22T07:48:44.000Z',
    finishedAt: '2026-11-22T08:40:05.000Z',
    apiUrl: 'https://api.desk.ba101.top',
    aborted: false,
    threshold: 4,
    intervalMs: 15000,
    consecutiveFailures: 0,
    outage: null,
    probes: [healthyProbe('2026-11-22T07:48:59.000Z')],
    ...overrides,
  };
}

function runCli(fileContents) {
  const directory = mkdtempSync(path.join(tmpdir(), 'stack-outage-'));
  const file = path.join(directory, 'stack-watch.json');
  if (fileContents !== null) writeFileSync(file, fileContents, 'utf8');
  const result = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('a missing timeline is not an outage and does not fail the step', () => {
  const { status, stdout } = runCli(null);
  assert.equal(status, 0);
  assert.match(stdout, /No .*stack-watch\.json/);
  assert.match(stdout, /no probe timeline exists/);
  assert.doesNotMatch(stdout, /::error/);
});

test('an unreadable timeline warns instead of failing the job', () => {
  const { status, stdout } = runCli('{not json');
  assert.equal(status, 0);
  assert.match(stdout, /::warning title=E2E stack probe timeline unreadable::/);
  assert.doesNotMatch(stdout, /::error/);
});

test('a healthy stack prints the timeline and no annotation', () => {
  const { status, stdout } = runCli(JSON.stringify(report()));
  assert.equal(status, 0);
  assert.match(stdout, /"episodes":0/);
  assert.doesNotMatch(stdout, /::warning/);
  assert.doesNotMatch(stdout, /::error/);
});

test('an outage that recovered without stopping the run is a warning, not a failure', () => {
  const flapping = report({
    probes: [
      healthyProbe('2026-11-22T07:48:59.000Z'),
      failedProbe('2026-11-22T07:56:43.673Z'),
      failedProbe('2026-11-22T07:57:00.000Z'),
      healthyProbe('2026-11-22T07:57:30.000Z'),
      failedProbe('2026-11-22T08:10:00.000Z'),
      healthyProbe('2026-11-22T08:13:29.000Z'),
    ],
    outage: {
      firstAt: '2026-11-22T07:56:43.673Z',
      lastAt: '2026-11-22T08:13:28.979Z',
      durationMs: 1005286,
      recovered: true,
    },
  });
  const { status, stdout } = runCli(JSON.stringify(flapping));
  assert.equal(status, 0, 'the reporter must never be the reason a run is red');
  assert.match(stdout, /::warning title=E2E stack outage \(infrastructure, not a code regression\)::/);
  assert.doesNotMatch(stdout, /::error/);
  assert.match(stdout, /3 of the last 6 GET https:\/\/api\.desk\.ba101\.top\/health probes failed in 2 episodes/);
  assert.match(stdout, /recovered: true, run stopped by the watchdog: false/);
  assert.match(stdout, /\[stack\] or \[stack-suspect\]/);
  assert.doesNotMatch(stdout, /E2E_API_URL/);
});

test('an outage that stopped the run is an error annotation and still exits 0', () => {
  const aborted = report({
    aborted: true,
    probes: [
      failedProbe('2026-11-22T07:56:43.673Z'),
      failedProbe('2026-11-22T07:57:00.000Z'),
      failedProbe('2026-11-22T07:57:15.000Z'),
      failedProbe('2026-11-22T07:57:30.000Z'),
    ],
    outage: {
      firstAt: '2026-11-22T07:56:43.673Z',
      lastAt: '2026-11-22T07:57:30.000Z',
      durationMs: 46673,
      recovered: false,
    },
  });
  const { status, stdout } = runCli(JSON.stringify(aborted));
  assert.equal(status, 0);
  assert.match(stdout, /::error title=E2E stack unavailable \(infrastructure, not a code regression\)::/);
  assert.match(stdout, /stopped the run after 4 consecutive failures/);
});

test('one failing streak is one episode, however long it is', () => {
  assert.equal(countEpisodes([]), 0);
  assert.equal(countEpisodes([healthyProbe('a'), failedProbe('b'), failedProbe('c')]), 1);
  assert.equal(
    countEpisodes([
      failedProbe('a'),
      healthyProbe('b'),
      failedProbe('c'),
      healthyProbe('d'),
      failedProbe('e'),
    ]),
    3,
  );
});

test('the report names the API from the artifact, never from the environment', () => {
  const summary = summarizeWatch(report({ apiUrl: '' }));
  assert.equal(summary.apiUrl, 'the configured API');
  assert.equal(renderReport(summary).includes('E2E_API_URL'), false);
  assert.equal(outageAnnotation(summary), null);
});

test('the step summary carries the window that has to be matched against a deploy', () => {
  const summary = summarizeWatch(
    report({
      outage: {
        firstAt: '2026-11-22T07:56:43.673Z',
        lastAt: '2026-11-22T08:13:28.979Z',
        durationMs: 1005286,
        recovered: true,
      },
    }),
  );
  const markdown = renderSummary(summary);
  assert.match(markdown, /### E2E stack probe timeline/);
  assert.match(markdown, /2026-11-22T07:56:43\.673Z to 2026-11-22T08:13:28\.979Z/);
  assert.match(markdown, /\| Recovered before the job ended \| true \|/);
});

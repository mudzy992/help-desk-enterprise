import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createState,
  describeProbe,
  looksLikeProxyPage,
  pageTitle,
  registerProbe,
} from './run-e2e.mjs';

const at = (second) => new Date(Date.UTC(2026, 10, 17, 8, 50, second)).toISOString();
const healthy = (second) => ({ at: at(second), ok: true, httpStatus: 200, proxyPage: false, title: null, error: null });
const proxyOutage = (second) => ({
  at: at(second),
  ok: false,
  httpStatus: 503,
  proxyPage: true,
  title: 'Site not available',
  error: null,
});

test('pageTitle reads the hosting layer error page', () => {
  assert.equal(pageTitle('<html><head><title>Site not available</title></head></html>'), 'Site not available');
  assert.equal(pageTitle('{"status":"ok"}'), null);
  assert.equal(pageTitle(undefined), null);
});

test('looksLikeProxyPage separates an HTML page from our JSON API', () => {
  assert.equal(looksLikeProxyPage('  \n<!DOCTYPE html><html></html>'), true);
  assert.equal(looksLikeProxyPage('{"status":"ok"}'), false);
  assert.equal(looksLikeProxyPage(''), false);
});

test('describeProbe names the proxy page instead of a bare status code', () => {
  assert.equal(describeProbe(proxyOutage(0)), 'HTTP 503, proxy page "Site not available"');
  assert.equal(
    describeProbe({ at: at(0), ok: false, httpStatus: null, proxyPage: false, title: null, error: 'ENOTFOUND' }),
    'network error (ENOTFOUND)',
  );
});

test('registerProbe opens the outage window on the first failure and keeps counting', () => {
  const state = createState({ apiUrl: 'https://api.example', threshold: 3, intervalMs: 15_000, now: () => at(0) });
  assert.equal(registerProbe(state, healthy(0)), false);
  assert.equal(state.outage, null);
  assert.equal(registerProbe(state, proxyOutage(15)), false);
  assert.equal(registerProbe(state, proxyOutage(30)), false);
  assert.equal(state.consecutiveFailures, 2);
  assert.equal(state.outage.firstAt, at(15));
  assert.equal(state.outage.lastAt, at(30));
  assert.equal(state.outage.durationMs, 15_000);
  assert.equal(state.outage.recovered, false);
});

test('registerProbe trips exactly once, on the probe that reaches the threshold', () => {
  const state = createState({ apiUrl: 'https://api.example', threshold: 3, intervalMs: 15_000, now: () => at(0) });
  const trips = [0, 15, 30, 45].map((second) => registerProbe(state, proxyOutage(second)));
  assert.deepEqual(trips, [false, false, true, false]);
  assert.equal(state.consecutiveFailures, 4);
});

test('registerProbe marks recovery and a second outage separately', () => {
  const state = createState({ apiUrl: 'https://api.example', threshold: 4, intervalMs: 15_000, now: () => at(0) });
  registerProbe(state, proxyOutage(0));
  registerProbe(state, proxyOutage(15));
  registerProbe(state, healthy(30));
  assert.equal(state.consecutiveFailures, 0);
  assert.equal(state.outage.recovered, true);

  registerProbe(state, proxyOutage(45));
  assert.equal(state.outage.recovered, false);
  assert.equal(state.outage.firstAt, at(0), 'the window of the first outage is kept, not restarted');
});

test('registerProbe keeps the probe list bounded', () => {
  const state = createState({ apiUrl: 'https://api.example', threshold: 4, intervalMs: 15_000, now: () => at(0) });
  for (let second = 0; second < 90; second += 1) registerProbe(state, healthy(second));
  assert.equal(state.probes.length, 60);
  assert.equal(state.probes.at(-1).at, at(89));
});

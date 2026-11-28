/*
  Guards for the path→spec map. A wrong map must cost time, never coverage, so the
  important assertions here are the fallbacks: an unknown path, a diff that would
  need more files than the fallback, and documentation alone.
*/
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  defaultSmokeSpecs,
  existingSpecNumbers,
  mappedSpecNumbers,
  maxMappedSpecs,
  selectE2eSpecs,
} from './e2e-spec-selection.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the default smoke set is the pre-2026-11-27 gate', () => {
  assert.deepEqual([...defaultSmokeSpecs], ['01', '02', '03', '15', '22', '54']);
});

test('RBAC code runs the RBAC browser spec plus one end-to-end canary', () => {
  const selection = selectE2eSpecs(['backend/src/modules/rbac/roles.service.ts']);
  assert.deepEqual(selection.specs, ['01', '38']);
  assert.equal(selection.fallback, false);
  assert.match(selection.reason, /rbac/);
});

test('authorization and principal-context changes use the same pair', () => {
  for (const file of [
    'backend/src/modules/authorization/evaluate-resource-policy.ts',
    'backend/src/common/principal-context/principal-context.loader.ts',
  ]) {
    assert.deepEqual(selectE2eSpecs([file]).specs, ['01', '38'], file);
  }
});

test('ticket code runs create, routing and the unrouted workflow spec', () => {
  assert.deepEqual(selectE2eSpecs(['backend/src/modules/tickets/tickets.service.ts']).specs, [
    '01',
    '02',
    '15',
  ]);
});

test('approvals are narrower than tickets: the approvals spec wins', () => {
  assert.deepEqual(selectE2eSpecs(['backend/src/modules/tickets/approvals/ticket-approvals.service.ts']).specs, [
    '03',
  ]);
});

test('a changed spec always runs itself', () => {
  assert.deepEqual(selectE2eSpecs(['e2e/tests/54-dashboard.spec.ts']).specs, ['54']);
  assert.deepEqual(selectE2eSpecs(['e2e/tests/38-users-groups-rbac.spec.ts']).specs, ['38']);
});

test('an unmapped code path falls back to the full smoke set', () => {
  const selection = selectE2eSpecs(['backend/src/app.module.ts']);
  assert.deepEqual(selection.specs, [...defaultSmokeSpecs]);
  assert.equal(selection.fallback, true);
  assert.match(selection.reason, /unmatched/);
});

test('a wider-than-fallback union falls back instead of growing the gate', () => {
  const selection = selectE2eSpecs([
    'backend/src/modules/rbac/a.ts',
    'backend/src/modules/tickets/b.ts',
    'backend/src/modules/notifications/c.ts',
  ]);
  assert.ok(selection.specs.length > maxMappedSpecs);
  assert.deepEqual(selection.specs, [...defaultSmokeSpecs]);
  assert.equal(selection.fallback, true);
});

test('documentation alone selects nothing', () => {
  const selection = selectE2eSpecs(['docs/backend/audits/03-rbac.md', 'README.md']);
  assert.equal(selection.fallback, true);
  assert.match(selection.reason, /no mapped spec/);
});

test('every spec the map can select exists on disk', () => {
  const existing = existingSpecNumbers(repositoryRoot);
  for (const number of mappedSpecNumbers()) {
    assert.ok(existing.has(number), `spec ${number} does not exist under e2e/tests`);
  }
});

test('the fallback set exists on disk as well', () => {
  const existing = existingSpecNumbers(repositoryRoot);
  for (const number of defaultSmokeSpecs) {
    assert.ok(existing.has(number), `fallback spec ${number} does not exist under e2e/tests`);
  }
});

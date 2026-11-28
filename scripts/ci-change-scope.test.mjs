/*
  Guards for the pull-request scope decision.

  The cases that matter are the ones that must NOT skip work: an unknown diff, a
  code file in the delta, a green run that is the same commit as the current head.
  The only case allowed to skip the code jobs is "everything since the green run
  is documentation", and it must say which green run it trusted.
*/
import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyFiles, classifyPath, resolveScope } from './ci-change-scope.mjs';
import { defaultSmokeSpecs } from './e2e-spec-selection.mjs';

test('classifies paths the way the workflow always has', () => {
  assert.deepEqual(classifyPath('docs/backend/audits/03-rbac.md'), { code: true, docs: true });
  assert.deepEqual(classifyPath('docs/backend/backend-findings-plan.json'), {
    code: true,
    docs: true,
  });
  assert.deepEqual(classifyPath('docs/backend/EXECUTION-PLAN-REMAINING.md'), {
    code: false,
    docs: true,
  });
  assert.deepEqual(classifyPath('README.md'), { code: false, docs: true });
  assert.deepEqual(classifyPath('perf/results/run.json'), { code: false, docs: true });
  assert.deepEqual(classifyPath('.cursor/rules/x.mdc'), { code: false, docs: true });
  assert.deepEqual(classifyPath('backend/src/main.ts'), { code: true, docs: false });
});

test('the findings register counts as code, because the guard parses it', () => {
  assert.equal(
    classifyFiles(['docs/backend/BACKEND-FINDINGS-REGISTER.md']).code,
    true,
  );
});

test('a documentation-only pull request runs no code job and no browser', () => {
  const scope = resolveScope({
    files: ['docs/plans/CI-KVALITETNA-KAPIJA.md', 'README.md'],
    deltaFiles: null,
    previousGreenSha: '',
  });
  assert.equal(scope.code, false);
  assert.equal(scope.docs, true);
  assert.deepEqual(scope.specs, []);
  assert.equal(scope.scope, 'docs-only');
});

test('a documentation follow-up on a green pull request skips the code jobs', () => {
  const green = 'e2acfd96a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const scope = resolveScope({
    files: ['backend/src/modules/rbac/roles.service.ts', 'docs/backend/implementation/369.md'],
    deltaFiles: ['docs/backend/implementation/369.md'],
    previousGreenSha: green,
  });
  assert.equal(scope.code, false);
  assert.equal(scope.docs, true);
  assert.equal(scope.scope, 'code-unchanged');
  assert.equal(scope.previousGreenSha, green);
  assert.match(scope.reason, /e2acfd96/);
});

test('one code file in the delta keeps the code jobs running', () => {
  const scope = resolveScope({
    files: ['backend/src/modules/rbac/roles.service.ts'],
    deltaFiles: ['backend/src/modules/rbac/roles.service.ts', 'docs/x.md'],
    previousGreenSha: 'abcdef1234567890abcdef1234567890abcdef12',
  });
  assert.equal(scope.code, true);
  assert.deepEqual(scope.specs, ['01', '38']);
  assert.equal(scope.scope, 'code-changed-since-green');
});

test('without a green run nothing is skipped, and specs come from the whole diff', () => {
  const scope = resolveScope({
    files: ['backend/src/modules/rbac/roles.service.ts'],
    deltaFiles: null,
    previousGreenSha: '',
  });
  assert.equal(scope.code, true);
  assert.deepEqual(scope.specs, ['01', '38']);
  assert.equal(scope.scope, 'code');
});

test('a "green run" that is the current head is not trusted', () => {
  const head = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  const scope = resolveScope({
    files: ['backend/src/modules/rbac/roles.service.ts'],
    deltaFiles: ['docs/x.md'],
    previousGreenSha: head,
    headSha: head,
  });
  assert.equal(scope.code, true);
  assert.equal(scope.previousGreenSha, '');
});

test('an unknown diff fails safe: every job runs with the full smoke set', () => {
  const scope = resolveScope({ files: null, deltaFiles: null, previousGreenSha: '' });
  assert.equal(scope.code, true);
  assert.equal(scope.docs, true);
  assert.deepEqual(scope.specs, [...defaultSmokeSpecs]);
  assert.equal(scope.scope, 'all');
});

test('an unmapped code change keeps the full smoke set', () => {
  const scope = resolveScope({
    files: ['backend/src/modules/users/users.service.ts'],
    deltaFiles: ['backend/src/modules/users/users.service.ts'],
    previousGreenSha: '',
  });
  assert.equal(scope.code, true);
  assert.deepEqual(scope.specs, [...defaultSmokeSpecs]);
  assert.equal(scope.specsFallback, true);
});

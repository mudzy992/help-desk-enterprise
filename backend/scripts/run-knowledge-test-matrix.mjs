import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import process from 'node:process';

/**
 * W7.92 (`BA-knowledge-base-19`): the knowledge base's concurrency and failure matrix.
 *
 * The audit found ten suites that did not even compile, and listed nine risk scenarios that no test
 * exercised. Both facts are now stale — but a list in a document is not a guard: nothing stopped the
 * next refactor from renaming or deleting the proof, and the audit then keeps claiming coverage it no
 * longer has. This file is the executable half: `knowledge-test-matrix.json` names, per scenario, the
 * spec **and the exact test name** that proves it, and this guard refuses to pass unless
 *
 *   1. every spec and every named test still exists,
 *   2. no listed test is silently skipped (`it.skip`, `xit`, `xdescribe`),
 *   3. every PostgreSQL spec is registered in `run-isolated-integration.mjs` — an unregistered
 *      integration spec compiles and then never runs in CI, which is the same lie as a broken suite,
 *   4. every scenario from the audit is covered at least once, and
 *   5. the audit chapter no longer carries the "10/12 compile-blocked" claim it started from.
 */

export const matrixCategories = Object.freeze([
  'concurrency',
  'failure',
  'scope',
  'corpus',
  'retention',
]);

/** The nine scenarios named in `25-knowledge-base.md` §12 as uncovered by E2E. */
export const matrixScenarios = Object.freeze([
  'owner/group/reviewer scope revoke',
  'concurrent edit/lifecycle',
  'unbounded corpus',
  'forged intercept resolution',
  'rating race',
  'from-reply idempotency',
  'view flush crash',
  'scheduler loss',
  'retention',
]);

const skipMarkers = [/\bx?it\.skip\(/u, /\bxit\(/u, /\bxdescribe\(/u, /\btest\.skip\(/u];

/** Phrases that describe the state *before* this package; the audit may not keep them as its status. */
const staleClaims = ['10/12 compile-blocked', '2/12 suiteova prošlo'];

export function validateKnowledgeTestMatrix({
  matrix,
  readSpec,
  specExists,
  integrationRegistry = '',
  auditDoc = '',
  scenarios = matrixScenarios,
  categories = matrixCategories,
}) {
  const problems = [];
  if (matrix === null || typeof matrix !== 'object' || Array.isArray(matrix)) {
    return ['matrica nije objekat sa kategorijama'];
  }
  for (const category of Object.keys(matrix)) {
    if (!categories.includes(category)) problems.push(`nepoznata kategorija: ${category}`);
  }
  const coveredScenarios = new Set();
  for (const category of categories) {
    const entries = matrix[category];
    if (!Array.isArray(entries) || entries.length === 0) {
      problems.push(`kategorija je prazna: ${category}`);
      continue;
    }
    for (const entry of entries) {
      const label = `${category}/${entry?.scenario ?? '?'}`;
      if (typeof entry?.scenario !== 'string' || !scenarios.includes(entry.scenario)) {
        problems.push(`${label}: scenario nije u §12 listi`);
      } else {
        coveredScenarios.add(entry.scenario);
      }
      if (typeof entry?.what !== 'string' || entry.what.trim() === '') {
        problems.push(`${label}: nema opisa (what)`);
      }
      if (typeof entry?.spec !== 'string' || entry.spec.trim() === '') {
        problems.push(`${label}: nema spec fajla`);
        continue;
      }
      if (typeof entry?.test !== 'string' || entry.test.trim() === '') {
        problems.push(`${label}: nema imena testa`);
        continue;
      }
      if (!specExists(entry.spec)) {
        problems.push(`${label}: spec ne postoji: ${entry.spec}`);
        continue;
      }
      const source = readSpec(entry.spec);
      if (!source.includes(entry.test)) {
        problems.push(`${label}: test nije u ${entry.spec}: ${entry.test}`);
        continue;
      }
      if (skipMarkers.some((marker) => marker.test(source))) {
        problems.push(`${label}: spec preskače testove: ${entry.spec}`);
      }
      if (entry.spec.endsWith('.integration.spec.ts') && !integrationRegistry.includes(`"${entry.spec}"`)) {
        problems.push(`${label}: integracioni spec nije u run-isolated-integration.mjs: ${entry.spec}`);
      }
    }
  }
  for (const scenario of scenarios) {
    if (!coveredScenarios.has(scenario)) problems.push(`scenario nije pokriven: ${scenario}`);
  }
  if (!auditDoc.includes('knowledge-test-matrix.json')) {
    problems.push('audit 25 ne upućuje na knowledge-test-matrix.json');
  }
  for (const claim of staleClaims) {
    if (auditDoc.includes(claim)) problems.push(`audit 25 još nosi zastarjelu tvrdnju: ${claim}`);
  }
  return problems;
}

function main() {
  const backendUrl = new URL('../', import.meta.url);
  const backendRoot = fileURLToPath(backendUrl);
  const matrix = JSON.parse(
    readFileSync(new URL('./knowledge-test-matrix.json', import.meta.url), 'utf8'),
  );
  const integrationRegistry = readFileSync(
    new URL('./run-isolated-integration.mjs', import.meta.url),
    'utf8',
  );
  const auditDoc = readFileSync(
    new URL('../../docs/backend/audits/25-knowledge-base.md', import.meta.url),
    'utf8',
  );
  const problems = validateKnowledgeTestMatrix({
    matrix,
    readSpec: (spec) => readFileSync(new URL(spec, backendUrl), 'utf8'),
    specExists: (spec) => existsSync(new URL(spec, backendUrl)),
    integrationRegistry,
    auditDoc,
  });
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`✗ ${problem}\n`);
    process.exit(1);
  }
  const paths = [...new Set(matrixCategories.flatMap((category) => matrix[category].map((e) => e.spec)))];
  const unit = paths.filter((path) => !path.endsWith('.integration.spec.ts'));
  process.stdout.write(
    `Knowledge test matrix: ${matrixCategories.length} kategorija, ${matrixScenarios.length} scenarija, ` +
      `${paths.length} spec fajlova (${unit.length} unit, ${paths.length - unit.length} PostgreSQL)\n`,
  );
  if (process.argv.includes('--check-only')) process.exit(0);
  const result = spawnSync(
    process.execPath,
    ['./node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath', ...unit],
    { cwd: backendRoot, stdio: 'inherit' },
  );
  process.exit(result.status ?? 1);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

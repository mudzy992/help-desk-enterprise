import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import process from 'node:process';

/**
 * W7.109 (`BA-reports-19`): the reports failure/concurrency matrix.
 *
 * The audit found twelve suites that did not even compile (`generated/prisma`
 * and an incomplete `PrismaService`), and listed eight risk areas that no test
 * exercised: huge corpus, attachment filter parity, foreign filter IDs,
 * concurrent schedule limit/update, Redis flush, SMTP accepted-crash, run
 * retention and privacy/anonymization. Both facts are stale today — W7.93–W7.108
 * built the proofs — but a list in a document is not a guard: nothing stopped
 * the next refactor from renaming or deleting a proof while the audit kept
 * claiming coverage.
 *
 * `reports-test-matrix.json` names, per scenario, the spec **and the exact test
 * name** that proves it. This guard refuses to pass unless
 *
 *   1. every spec and every named test still exists,
 *   2. no listed spec silently skips tests (`it.skip`, `xit`, `xdescribe`,
 *      `test.skip`) — a conditional `describe.skip` for a missing database or
 *      Redis is allowed, because CI provides both,
 *   3. every PostgreSQL spec is registered in `run-isolated-integration.mjs`,
 *      since an unregistered integration spec compiles and then never runs,
 *   4. every scenario the audit lists is covered at least once, and
 *   5. audit 26 points at this matrix and no longer carries the
 *      "15/27 suiteova prošlo, 12/27 compile-blocked" snapshot.
 */

export const matrixCategories = Object.freeze([
  'compile',
  'corpus',
  'scope',
  'attachments',
  'concurrency',
  'redis',
  'smtp',
  'failure',
  'retention',
  'privacy',
]);

/**
 * The scenarios named in `26-reports.md` §10: the twelve compile-blocked suites
 * plus the evidence the audit explicitly found missing. `duplicate
 * delivery/command` and `failure isolation` are the two scenarios the module
 * opened afterwards (W7.99, W7.106, W7.108); they are part of the matrix
 * because leaving them out would repeat the audit's own mistake.
 */
export const matrixScenarios = Object.freeze([
  'compile-blocked suites',
  'huge corpus',
  'attachment filter parity',
  'foreign filter IDs',
  'concurrent schedule limit',
  'concurrent schedule update',
  'duplicate delivery/command',
  'Redis flush',
  'SMTP accepted-crash',
  'failure isolation',
  'run retention',
  'privacy/anonymization',
]);

const skipMarkers = [/\bx?it\.skip\(/u, /\bxit\(/u, /\bxdescribe\(/u, /\btest\.skip\(/u];

/** Phrases that describe the state *before* this package; the audit may not keep them as status. */
const staleClaims = ['15/27 suiteova prošlo', '12/27 compile-blocked'];

export function validateReportsTestMatrix({
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
        problems.push(`${label}: scenario nije u §10 listi`);
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
  if (!auditDoc.includes('reports-test-matrix.json')) {
    problems.push('audit 26 ne upućuje na reports-test-matrix.json');
  }
  for (const claim of staleClaims) {
    if (auditDoc.includes(claim)) problems.push(`audit 26 još nosi zastarjelu tvrdnju: ${claim}`);
  }
  return problems;
}

function main() {
  const backendUrl = new URL('../', import.meta.url);
  const backendRoot = fileURLToPath(backendUrl);
  const matrix = JSON.parse(readFileSync(new URL('./reports-test-matrix.json', import.meta.url), 'utf8'));
  const integrationRegistry = readFileSync(new URL('./run-isolated-integration.mjs', import.meta.url), 'utf8');
  const auditDoc = readFileSync(new URL('../../docs/backend/audits/26-reports.md', import.meta.url), 'utf8');
  const problems = validateReportsTestMatrix({
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
  const rows = matrixCategories.reduce((total, category) => total + matrix[category].length, 0);
  process.stdout.write(
    `Reports test matrix: ${matrixCategories.length} kategorija, ${matrixScenarios.length} scenarija, ` +
      `${rows} redova, ${paths.length} spec fajlova (${unit.length} unit, ${paths.length - unit.length} PostgreSQL)\n`,
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

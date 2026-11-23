import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  matrixCategories,
  matrixScenarios,
  validateReportsTestMatrix,
} from './run-reports-test-matrix.mjs';

const spec = 'src/modules/reports/schedules/report-schedules.spec.ts';
const integration = 'src/modules/reports/schedules/report-schedule-limit.integration.spec.ts';

function fixture(overrides = {}) {
  const matrix = Object.fromEntries(
    matrixCategories.map((category) => [
      category,
      [{ scenario: matrixScenarios[0], what: 'opis', spec, test: 'never sends twice' }],
    ]),
  );
  // Every scenario must be covered, so give each remaining one its own row.
  matrixScenarios.slice(1).forEach((scenario, index) => {
    matrix.concurrency.push({ scenario, what: `opis ${index}`, spec, test: 'never sends twice' });
  });
  return {
    matrix,
    readSpec: () => "it('never sends twice when another worker already claimed the slot', async () => {});",
    specExists: () => true,
    integrationRegistry: `export const integrationSpecs = Object.freeze([\n  "${integration}",\n]);\n`,
    auditDoc: 'Matrica: `backend/scripts/reports-test-matrix.json` (§10).',
    ...overrides,
  };
}

test('prihvata matricu u kojoj svaki scenario ima postojeći test', () => {
  assert.deepEqual(validateReportsTestMatrix(fixture()), []);
});

test('odbija spec koji ne postoji', () => {
  const problems = validateReportsTestMatrix(fixture({ specExists: () => false }));
  assert.ok(problems.some((problem) => problem.includes('spec ne postoji')));
});

test('odbija preimenovan test — ime iz matrice mora postojati u specu', () => {
  const problems = validateReportsTestMatrix(fixture({ readSpec: () => "it('something else')" }));
  assert.ok(problems.some((problem) => problem.includes('test nije u')));
});

test('odbija preskočen test, jer zelena oznaka tada laže', () => {
  const problems = validateReportsTestMatrix(
    fixture({ readSpec: () => "xit('never sends twice when another worker already claimed the slot')" }),
  );
  assert.ok(problems.some((problem) => problem.includes('preskače testove')));
});

test('dozvoljava uslovni describe.skip koji čeka bazu ili Redis', () => {
  const problems = validateReportsTestMatrix(
    fixture({
      readSpec: () =>
        "const describeIfDatabase = url ? describe : describe.skip;\n" +
        "it('never sends twice when another worker already claimed the slot', async () => {});",
    }),
  );
  assert.deepEqual(problems, []);
});

test('odbija PostgreSQL spec koji nije registrovan u izolovanim integracijama', () => {
  const data = fixture({ integrationRegistry: 'export const integrationSpecs = Object.freeze([]);' });
  data.matrix.concurrency.push({
    scenario: matrixScenarios[1],
    what: 'integracija',
    spec: integration,
    test: 'lets exactly one of two concurrent saves take the last slot',
  });
  data.readSpec = () => "it('lets exactly one of two concurrent saves take the last slot')\n";
  const problems = validateReportsTestMatrix(data);
  assert.ok(problems.some((problem) => problem.includes('nije u run-isolated-integration.mjs')));
});

test('odbija scenario iz §10 koji nema nijedan red', () => {
  const data = fixture();
  data.matrix.concurrency = data.matrix.concurrency.filter(
    (entry) => entry.scenario !== matrixScenarios[7],
  );
  const problems = validateReportsTestMatrix(data);
  assert.ok(problems.some((problem) => problem.includes(`scenario nije pokriven: ${matrixScenarios[7]}`)));
});

test('odbija scenario koji nije u §10 listi i praznu kategoriju', () => {
  const data = fixture();
  data.matrix.concurrency.push({ scenario: 'izmišljen scenario', what: 'x', spec, test: 'never sends twice' });
  data.matrix.retention = [];
  const problems = validateReportsTestMatrix(data);
  assert.ok(problems.some((problem) => problem.includes('scenario nije u §10 listi')));
  assert.ok(problems.some((problem) => problem.includes('kategorija je prazna: retention')));
});

test('odbija red bez imena testa ili bez opisa', () => {
  const data = fixture();
  delete data.matrix.corpus[0].test;
  data.matrix.corpus[0].what = '  ';
  const problems = validateReportsTestMatrix(data);
  assert.ok(problems.some((problem) => problem.includes('nema imena testa')));
  assert.ok(problems.some((problem) => problem.includes('nema opisa')));
});

test('odbija audit koji nema link na matricu ili još nosi zastarjelu tvrdnju', () => {
  const noLink = validateReportsTestMatrix(fixture({ auditDoc: '§10 bez matrice' }));
  assert.ok(noLink.some((problem) => problem.includes('ne upućuje na reports-test-matrix.json')));
  const stale = validateReportsTestMatrix(
    fixture({ auditDoc: 'Matrica: reports-test-matrix.json — tek 15/27 suiteova prošlo.' }),
  );
  assert.ok(stale.some((problem) => problem.includes('zastarjelu tvrdnju')));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  matrixCategories,
  matrixScenarios,
  validateKnowledgeTestMatrix,
} from './run-knowledge-test-matrix.mjs';

const spec = 'src/modules/knowledge-base/knowledge-base.concurrency.spec.ts';
const integration = 'src/modules/knowledge-base/knowledge-placement-atomicity.integration.spec.ts';

function fixture(overrides = {}) {
  const matrix = Object.fromEntries(
    matrixCategories.map((category) => [
      category,
      [{ scenario: matrixScenarios[0], what: 'opis', spec, test: 'lets the first of two edits win' }],
    ]),
  );
  // Every scenario must be covered, so give each remaining one its own row.
  matrixScenarios.slice(1).forEach((scenario, index) => {
    matrix.concurrency.push({
      scenario,
      what: `opis ${index}`,
      spec,
      test: 'lets the first of two edits win',
    });
  });
  return {
    matrix,
    readSpec: () => "it('lets the first of two edits win and rejects the stale one', async () => {});",
    specExists: () => true,
    integrationRegistry: `export const integrationSpecs = Object.freeze([\n  "${integration}",\n]);\n`,
    auditDoc: 'Matrica: `backend/scripts/knowledge-test-matrix.json` (§12).',
    ...overrides,
  };
}

test('prihvata matricu u kojoj svaki scenario ima postojeći test', () => {
  assert.deepEqual(validateKnowledgeTestMatrix(fixture()), []);
});

test('odbija spec koji ne postoji', () => {
  const problems = validateKnowledgeTestMatrix(fixture({ specExists: () => false }));
  assert.ok(problems.some((problem) => problem.includes('spec ne postoji')));
});

test('odbija preimenovan test — ime iz matrice mora postojati u specu', () => {
  const problems = validateKnowledgeTestMatrix(fixture({ readSpec: () => "it('something else')" }));
  assert.ok(problems.some((problem) => problem.includes('test nije u')));
});

test('odbija preskočen test, jer zelena oznaka tada laže', () => {
  const problems = validateKnowledgeTestMatrix(
    fixture({ readSpec: () => "xit('lets the first of two edits win')" }),
  );
  assert.ok(problems.some((problem) => problem.includes('preskače testove')));
});

test('odbija PostgreSQL spec koji nije registrovan u izolovanim integracijama', () => {
  const data = fixture({ integrationRegistry: 'export const integrationSpecs = Object.freeze([]);' });
  data.matrix.postgresql = undefined;
  data.matrix.concurrency.push({
    scenario: matrixScenarios[1],
    what: 'integracija',
    spec: integration,
    test: 'only lets the placement land',
  });
  data.readSpec = () => "it('only lets the placement land on the row the request read')";
  const problems = validateKnowledgeTestMatrix(data);
  assert.ok(problems.some((problem) => problem.includes('nije u run-isolated-integration.mjs')));
});

test('odbija scenario iz §12 koji nema nijedan red', () => {
  const data = fixture();
  data.matrix.concurrency = data.matrix.concurrency.filter(
    (entry) => entry.scenario !== matrixScenarios[3],
  );
  const problems = validateKnowledgeTestMatrix(data);
  assert.ok(problems.some((problem) => problem.includes(`scenario nije pokriven: ${matrixScenarios[3]}`)));
});

test('odbija scenario koji nije u §12 listi i praznu kategoriju', () => {
  const data = fixture();
  data.matrix.concurrency.push({ scenario: 'izmišljen scenario', what: 'x', spec, test: 'lets the first' });
  data.matrix.retention = [];
  const problems = validateKnowledgeTestMatrix(data);
  assert.ok(problems.some((problem) => problem.includes('scenario nije u §12 listi')));
  assert.ok(problems.some((problem) => problem.includes('kategorija je prazna: retention')));
});

test('odbija audit koji nema link na matricu ili još nosi zastarjelu tvrdnju', () => {
  const noLink = validateKnowledgeTestMatrix(fixture({ auditDoc: '§12 bez matrice' }));
  assert.ok(noLink.some((problem) => problem.includes('ne upućuje na knowledge-test-matrix.json')));
  const stale = validateKnowledgeTestMatrix(
    fixture({ auditDoc: 'Matrica: knowledge-test-matrix.json — tek 2/12 suiteova prošlo.' }),
  );
  assert.ok(stale.some((problem) => problem.includes('zastarjelu tvrdnju')));
});

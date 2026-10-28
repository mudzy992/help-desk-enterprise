import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { URL } from 'node:url';

const matrix = JSON.parse(readFileSync(new URL('./sla-test-matrix.json', import.meta.url), 'utf8'));
const required = ['failure', 'concurrency', 'scope', 'dst', 'fakeClock', 'postgresql'];
for (const category of required) {
  if (!Array.isArray(matrix[category]) || matrix[category].length === 0) throw new Error(`SLA matrix category is empty: ${category}`);
}
const paths = [...new Set(required.flatMap((category) => matrix[category]))];
for (const path of paths) {
  if (!existsSync(path)) throw new Error(`SLA matrix test does not exist: ${path}`);
}
for (const path of matrix.postgresql) {
  if (!path.endsWith('.integration.spec.ts')) throw new Error(`PostgreSQL matrix entry must be an integration spec: ${path}`);
}
for (const path of matrix.fakeClock) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes('jest.useFakeTimers')) throw new Error(`Fake-clock matrix entry is not deterministic: ${path}`);
}
const workflow = readFileSync('../.github/workflows/ci.yml', 'utf8');
for (const contract of ['Generate and verify the Prisma client', 'npm run test:integration', 'npm run test:sla:matrix']) {
  if (!workflow.includes(contract)) throw new Error(`CI does not execute SLA matrix prerequisite: ${contract}`);
}
process.stdout.write(`SLA test matrix: ${paths.length} unique specs across ${required.length} categories\n`);
if (process.argv.includes('--check-only')) process.exit(0);
const unit = paths.filter((path) => !path.endsWith('.integration.spec.ts'));
const result = spawnSync(process.execPath, ['./node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath', ...unit], { stdio: 'inherit' });
process.exit(result.status ?? 1);

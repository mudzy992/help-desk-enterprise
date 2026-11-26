import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  offlineSafeCommands,
  placeholderDatabaseUrl,
  planInvocation,
  sentinelFileName,
} from './prisma-offline.mjs';

/*
  W2.20 (`BA-authentication-07`): the contract of the offline Prisma wrapper. The
  finding was that the build path silently depended on `binaries.prisma.sh`; these
  tests pin the two halves of the fix — the offline-safe commands never reach for a
  binary, and the commands that do need one are never handed the sentinel.
*/

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptsDirectory, '..');
const sentinelPath = path.join(scriptsDirectory, sentinelFileName);

describe('offline Prisma wrapper (W2.20)', () => {
  it('covers exactly the commands that build from the schema alone', () => {
    assert.deepEqual([...offlineSafeCommands], ['generate', 'validate', 'format']);
  });

  it('points generate/validate/format at the sentinel instead of the network', () => {
    for (const command of offlineSafeCommands) {
      const plan = planInvocation({ command, env: {}, sentinelPath });
      assert.equal(plan.offline, true, command);
      assert.equal(plan.reason, 'sentinel', command);
      assert.equal(plan.env.PRISMA_SCHEMA_ENGINE_BINARY, sentinelPath, command);
      assert.equal(plan.env.PRISMA_HIDE_UPDATE_MESSAGE, '1', command);
    }
  });

  it('never replaces an operator-provided engine', () => {
    const staged = '/opt/prisma/schema-engine-debian-openssl-3.0.x';
    const plan = planInvocation({
      command: 'generate',
      env: { PRISMA_SCHEMA_ENGINE_BINARY: staged },
      sentinelPath,
    });
    assert.equal(plan.reason, 'operator-engine');
    assert.equal(plan.env.PRISMA_SCHEMA_ENGINE_BINARY, staged);
  });

  it('leaves commands that need the real engine untouched', () => {
    for (const command of ['migrate', 'db', 'db:generate']) {
      const plan = planInvocation({ command, env: {}, sentinelPath });
      assert.equal(plan.offline, false, command);
      assert.equal(plan.reason, 'engine-required', command);
      assert.equal(plan.env.PRISMA_SCHEMA_ENGINE_BINARY, undefined, command);
    }
    const withArgs = planInvocation({ command: '', env: {}, sentinelPath });
    assert.equal(withArgs.offline, false);
    assert.equal(withArgs.reason, 'no-command');
  });

  it('supplies a placeholder DATABASE_URL without clobbering a real one', () => {
    const bare = planInvocation({ command: 'generate', env: {}, sentinelPath });
    assert.equal(bare.env.DATABASE_URL, placeholderDatabaseUrl);
    const configured = planInvocation({
      command: 'generate',
      env: { DATABASE_URL: 'postgresql://servicedesk:servicedesk@127.0.0.1:5432/servicedesk' },
      sentinelPath,
    });
    assert.equal(configured.env.DATABASE_URL, 'postgresql://servicedesk:servicedesk@127.0.0.1:5432/servicedesk');
  });

  it('ships a sentinel that fails loudly if anything ever executes it', async () => {
    const metadata = await stat(sentinelPath);
    assert.equal(metadata.isFile(), true);
    assert.equal(metadata.size > 0, true);
    // Executable bit matters only on POSIX; the CLI just needs the path to exist.
    if (process.platform !== 'win32') assert.equal((metadata.mode & 0o111) !== 0, true);

    const run = spawnSync(process.execPath, [sentinelPath], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    const output = `${run.stdout}${run.stderr}`;
    assert.match(output, /nije dostupan/);
    assert.match(output, /prisma\/engines\.lock\.json/);
  });

  it('pins the engine identity that the migrate path still needs', async () => {
    const lock = JSON.parse(await readFile(path.join(backendRoot, 'prisma', 'engines.lock.json'), 'utf8'));
    const installed = JSON.parse(
      await readFile(
        path.join(backendRoot, 'node_modules', '@prisma', 'engines-version', 'package.json'),
        'utf8',
      ),
    );
    assert.equal(
      lock.enginesVersion,
      installed.prisma.enginesVersion,
      'Prisma bump: update prisma/engines.lock.json in the same reviewed commit',
    );
    assert.equal(lock.engineCommit, installed.prisma.enginesVersion.split('.').pop());
    assert.equal(lock.buildPathRequiresEngineBinary, false);
    assert.equal(lock.migratePathRequiresEngineBinary, true);
    assert.equal(lock.offlineStaging.variable, 'PRISMA_SCHEMA_ENGINE_BINARY');
  });
});

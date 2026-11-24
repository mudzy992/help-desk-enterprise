import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/*
  W1.7 (`BA-xcut-20`): the redaction contract is only worth having if it cannot
  regress. These rules are the contract in executable form — they fail the build
  when a new file writes around the central logger or hands a raw stack to a
  sink.

  The allowlists are deliberate:

    - `src/cli/**` prints to stdout on purpose; that is the product of a CLI, not
      application logging, and it is operator-visible by design.
    - `src/common/logging/**` is the sanitizer itself, which is the only code
      allowed to read `.stack`.
    - `src/flush-worker-telemetry.ts` flushes the streams at shutdown and writes
      no messages of its own.
*/

const sourceRoot = path.join(__dirname, '..', '..');

describe('log contract (W1.7, BA-xcut-20)', () => {
  const files = listSourceFiles(sourceRoot);

  it('finds the source tree (guards against a silently empty scan)', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it('keeps console output inside the CLI', () => {
    const offenders = files
      .filter((file) => !isCliFile(file))
      .filter((file) => /\bconsole\.(log|error|warn|info|debug|trace)\s*\(/u.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it('reads exception stacks only through the sanitizer', () => {
    const offenders = files
      .filter((file) => !file.startsWith(path.join('common', 'logging')))
      .filter((file) => /\.stack\b/u.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it('writes to process streams only where that is the documented purpose', () => {
    const allowed = new Set(['flush-worker-telemetry.ts']);
    const offenders = files
      .filter((file) => !isCliFile(file))
      .filter((file) => !allowed.has(path.basename(file)))
      .filter((file) => /process\.(stdout|stderr)\.write\s*\(/u.test(read(file)));
    expect(offenders).toEqual([]);
  });
});

function listSourceFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'generated' || entry.name === 'node_modules') continue;
        walk(absolute);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) continue;
      found.push(path.relative(root, absolute));
    }
  };
  walk(root);
  return found.sort();
}

function isCliFile(file: string): boolean {
  return file.startsWith(path.join('cli'));
}

function read(relativePath: string): string {
  return readFileSync(path.join(sourceRoot, relativePath), 'utf8');
}

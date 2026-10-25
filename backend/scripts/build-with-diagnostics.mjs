import { spawnSync } from 'node:child_process';
const run = spawnSync(process.execPath, ['node_modules/@nestjs/cli/bin/nest.js', 'build'], { encoding: 'utf8' });
process.stdout.write(run.stdout ?? '');
process.stderr.write(run.stderr ?? '');
if (run.status !== 0 && process.env.GITHUB_ACTIONS === 'true') {
  const text = `${run.stdout ?? ''}\n${run.stderr ?? ''}`.replace(/\u001b\[[0-9;]*m/g, '').slice(-12000).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::error title=Backend TypeScript diagnostics::${text}`);
}
process.exit(run.status ?? 1);

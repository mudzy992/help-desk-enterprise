import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import {
  DemoInventoryError,
  planDemoInventory,
  runDemoRemoval,
  runDemoSeed,
  type DemoRemovalResult,
  type DemoSeedResult,
} from './assets-demo-inventory';
import { CliInvocationError, formatCliTarget, type CliTarget } from './safety/cli-target';
import { resolveCliInvocation, type CliInvocation } from './safety/cli-invocation';
import {
  CliOperatorError,
  resolveCliOperatorId,
  type CliOperatorClient,
} from './safety/cli-operator-audit';

/*
  Paket 3.2 (§15), preuređen u W1.5 (`BA-xcut-08`).

  The audit found this command writing demo data into whatever `DATABASE_URL`
  pointed at, and `--remove` hard-deleting several tables without a production
  guard, a typed confirmation or an audit row. The command below is the fix, and
  the shape of the fix is the point: **the default is a dry run**, a write needs
  an environment, a reason, an operator and the target fingerprint typed back,
  and every apply leaves a `cli.command.executed` row in the audit chain.

    docker exec -i "$BACKEND" node dist/src/cli/assets-seed-demo.js \
      --environment <development|staging|production>

  The dry run prints the plan and the exact `--confirm` phrase for this target.
  Nothing is written until the operator pastes it back:

    ... --apply --reason "<zašto>" --operator <admin adresa> \
        --confirm "assets-seed-demo@<environment>:<fingerprint>" \
        [--allow-production] [--remove]

  `--remove` is a mode of `--apply`; it cannot skip the guards a write already
  needs. Adding demo data is refused when demo data already exists (run
  `--remove` first); removal keeps demo assets that a ticket still references and
  reports them, so it never unlinks business history.
*/

const command = 'assets-seed-demo';

const usage = [
  `Usage: ${command} --environment <development|staging|production>`,
  `       ${command} --environment <environment> --apply --reason "<at least 5 characters>" \\`,
  `         --operator <admin email> --confirm "${command}@<environment>:<fingerprint>" \\`,
  `         [--allow-production] [--remove]`,
  '',
  'Without --apply this is a dry run: it prints the target, the plan and the',
  'confirmation phrase for this database, and writes nothing (not even the audit).',
  '--remove deletes the demo inventory; demo assets a ticket still references stay.',
].join('\n');

function printPlan(target: CliTarget, plan: Awaited<ReturnType<typeof planDemoInventory>>): void {
  console.log(`target: ${formatCliTarget(target)}`);
  console.log('mode:   dry run — nothing is written');
  if (plan.unitPath === null) {
    console.log('unit:   (no organisational unit yet — the seed needs the install to have run)');
  } else {
    console.log(`unit:   ${plan.unitPath}`);
  }
  if (plan.missingAssetTypes.length > 0) {
    console.log(`asset types missing (skipped by the seed): ${plan.missingAssetTypes.join(', ')}`);
  }
  if (plan.alreadyPresent) {
    console.log(
      `demo inventory present: ${plan.demoAssets} assets (${plan.removableAssets} removable, ${plan.retainedAssets} referenced by tickets), ` +
        `${plan.demoLocations} locations, ${plan.demoLicenses} licences, ${plan.demoContracts} contracts`,
    );
    console.log('a seed run would do nothing; use --remove to delete the demo inventory.');
  } else {
    console.log('demo inventory present: none — a seed run would create the demo catalogue.');
  }
}

function printSeedResult(target: CliTarget, result: DemoSeedResult): void {
  if (result.alreadyPresent) {
    console.log(`${target.environment}: demo data already exists; nothing written. Run --apply --remove first.`);
    return;
  }
  console.log(
    `seeded ${result.assets} demo assets, ${result.locations} locations, ${result.licenses} licences and ${result.contracts} contracts ` +
      `in ${result.unitPath ?? '(unknown unit)'} for ${result.assignedUsers} user(s).`,
  );
  if (result.linkedTickets > 0) {
    console.log(`${result.linkedTickets} existing ticket(s) were linked to a demo asset, so --remove will keep that asset.`);
  }
  if (result.missingAssetTypes.length > 0) {
    console.log(`asset types missing (skipped): ${result.missingAssetTypes.join(', ')}`);
  }
  console.log(`audited as ${command} (outcome=completed) in the installation audit chain.`);
}

function printRemovalResult(target: CliTarget, result: DemoRemovalResult): void {
  console.log(
    `removed ${result.assets} demo assets, ${result.locations} locations, ${result.licenses} licences and ${result.contracts} contracts ` +
      `from ${target.environment}.`,
  );
  if (result.retainedLicenses > 0 || result.retainedContracts > 0) {
    console.log(
      `${result.retainedLicenses} demo licence(s) still assigned to people and ${result.retainedContracts} contract(s) with items were kept ` +
        '(unassign/unlink first if they must go).',
    );
  }
  if (result.retainedReferencedAssets > 0) {
    console.log(
      `${result.retainedReferencedAssets} of ${result.totalDemoAssets} demo assets are referenced by tickets and were kept ` +
        '(unlink the ticket first if they must go).',
    );
  }
  console.log(`audited as ${command} (outcome=completed) in the installation audit chain.`);
}

function printApplyHint(target: CliTarget, expectedConfirmation: string): void {
  const productionFlag = target.environment === 'production' ? ' --allow-production' : '';
  console.log('');
  console.log('to write this plan, re-run with:');
  console.log(
    `  --apply --reason "<why>" --operator <admin email> --confirm ${expectedConfirmation}${productionFlag} [--remove]`,
  );
}

async function main(argv: readonly string[]): Promise<number> {
  if (argv.includes('--help')) {
    console.log(usage);
    return 0;
  }
  let invocation: CliInvocation;
  try {
    invocation = resolveCliInvocation({
      command,
      argv,
      env: process.env,
      databaseUrl: process.env.DATABASE_URL,
      supportsRemove: true,
    });
  } catch (error) {
    if (error instanceof CliInvocationError) {
      console.error(`${command} refused: ${error.reason}`);
      console.error(usage);
      return error.exitCode;
    }
    throw error;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
  });
  try {
    if (!invocation.apply) {
      const plan = await planDemoInventory(prisma);
      printPlan(invocation.target, plan);
      printApplyHint(invocation.target, invocation.expectedConfirmation);
      return 0;
    }

    const operatorUserId = await resolveCliOperatorId(
      prisma as unknown as CliOperatorClient,
      invocation.operatorEmail as string,
    );
    const audit = {
      command,
      target: invocation.target,
      reason: invocation.reason as string,
      operatorUserId,
      confirmation: invocation.expectedConfirmation,
    };
    console.log(`target: ${formatCliTarget(invocation.target)}`);
    console.log(`mode:   apply${invocation.remove ? ' (remove)' : ''} by operator ${invocation.operatorEmail}`);
    if (invocation.remove) {
      const result = await runDemoRemoval(prisma, audit);
      printRemovalResult(invocation.target, result);
      return 0;
    }
    const result = await runDemoSeed(prisma, audit);
    printSeedResult(invocation.target, result);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      if (error instanceof CliOperatorError || error instanceof DemoInventoryError) {
        console.error(`${command} refused: ${error.reason}`);
        process.exit(error instanceof CliOperatorError ? error.exitCode : 1);
      }
      console.error(error);
      process.exit(1);
    },
  );
}

export { main };

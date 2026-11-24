import {
  CliInvocationError,
  confirmationPhrase,
  readCliFlag,
  resolveCliTarget,
  type CliTarget,
} from './cli-target';

/*
  W1.5 (`BA-xcut-08`): the whole write/no-write decision of a CLI lives in this
  one function, so it can be tested without a database and so that no command
  can accidentally skip a guard by forgetting to call one.

  The contract, in order of increasing danger:

    dry run (default)  no flags beyond --environment
    --apply            --environment E --reason R --operator O --confirm <phrase>
    production         ... plus --allow-production

  `--remove` is a mode of `--apply`, not an alternative: a destructive command
  cannot skip the reasons and the confirmation that a write already needs.
*/

export const cliReasonMinimumLength = 5;

const baseFlags = ['environment', 'apply', 'remove', 'reason', 'operator', 'confirm', 'allow-production', 'help'] as const;

export type CliInvocation = Readonly<{
  readonly command: string;
  readonly target: CliTarget;
  readonly apply: boolean;
  readonly remove: boolean;
  readonly reason: string | null;
  readonly operatorEmail: string | null;
  readonly expectedConfirmation: string;
}>;

export function resolveCliInvocation(input: {
  readonly command: string;
  readonly argv: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly databaseUrl: string | undefined;
  /** Commands that have no destructive mode reject `--remove` outright. */
  readonly supportsRemove?: boolean;
}): CliInvocation {
  assertKnownFlags(input.argv);
  const target = resolveCliTarget({ argv: input.argv, env: input.env, databaseUrl: input.databaseUrl });
  const apply = input.argv.includes('--apply');
  const remove = input.argv.includes('--remove');
  if (remove && input.supportsRemove === false) {
    throw new CliInvocationError(`CLI_COMMAND_HAS_NO_REMOVE_MODE:${input.command}`);
  }
  if (remove && !apply) {
    throw new CliInvocationError('CLI_REMOVE_REQUIRES_APPLY');
  }
  const expectedConfirmation = confirmationPhrase({ command: input.command, target });
  if (!apply) {
    return {
      command: input.command,
      target,
      apply: false,
      remove: false,
      reason: null,
      operatorEmail: null,
      expectedConfirmation,
    };
  }

  const reason = readCliFlag(input.argv, 'reason') ?? (input.env.CLI_REASON?.trim() ?? null);
  if (reason === null) {
    throw new CliInvocationError('CLI_APPLY_REQUIRES_REASON');
  }
  if (reason.length < cliReasonMinimumLength) {
    throw new CliInvocationError(`CLI_REASON_TOO_SHORT:${cliReasonMinimumLength}`);
  }

  const operatorEmail = readCliFlag(input.argv, 'operator') ?? (input.env.CLI_OPERATOR?.trim() ?? null);
  if (operatorEmail === null || operatorEmail.length === 0) {
    throw new CliInvocationError('CLI_APPLY_REQUIRES_OPERATOR');
  }
  if (!/^[^@\s]+@[^@\s]+$/u.test(operatorEmail)) {
    throw new CliInvocationError('CLI_OPERATOR_INVALID');
  }

  const confirmation = readCliFlag(input.argv, 'confirm');
  if (confirmation === null || confirmation.length === 0) {
    throw new CliInvocationError('CLI_APPLY_REQUIRES_CONFIRMATION');
  }
  if (confirmation !== expectedConfirmation) {
    // The expected phrase is printed on purpose: it is the target fingerprint,
    // not a secret, and the operator cannot type what they cannot see.
    throw new CliInvocationError(`CLI_CONFIRMATION_MISMATCH:expected=${expectedConfirmation}`);
  }

  if (target.environment === 'production' && !input.argv.includes('--allow-production')) {
    throw new CliInvocationError('CLI_PRODUCTION_REQUIRES_ALLOW_FLAG');
  }

  return {
    command: input.command,
    target,
    apply: true,
    remove,
    reason,
    operatorEmail,
    expectedConfirmation,
  };
}

/**
 * A typo must never be mistaken for a mode we do not have: `--aply` would
 * otherwise run as a dry run and look successful while nothing happened.
 */
function assertKnownFlags(argv: readonly string[]): void {
  const known = new Set<string>(baseFlags.map((flag) => `--${flag}`));
  for (const argument of argv) {
    if (!argument.startsWith('--')) continue;
    if (known.has(argument)) continue;
    throw new CliInvocationError(`CLI_UNKNOWN_FLAG:${argument}`);
  }
}

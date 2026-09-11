import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  GuardrailClaimDecision,
  GuardrailClaimInput,
  TicketGuardrailsConfiguration,
} from './guardrails.types';
import { runExclusiveGuardrail } from './run-exclusive-guardrail';

export async function claimGuardrailTrigger(input: {
  readonly prisma: PrismaService;
  readonly configuration: TicketGuardrailsConfiguration;
  readonly claim: GuardrailClaimInput;
}): Promise<GuardrailClaimDecision> {
  if (!input.configuration.enabled) {
    return { allowed: true, reason: 'disabled' };
  }
  return runExclusiveGuardrail(
    `${input.claim.kind}:${input.claim.subjectKey}`,
    () => claimExclusive(input),
  );
}

async function claimExclusive(input: {
  readonly prisma: PrismaService;
  readonly configuration: TicketGuardrailsConfiguration;
  readonly claim: GuardrailClaimInput;
}): Promise<GuardrailClaimDecision> {
  const now = input.claim.now ?? new Date();
  const windowStart = new Date(
    now.getTime() - input.configuration.duplicateWindowMinutes * 60_000,
  );
  const recentCount = await input.prisma.guardrailClaim.count({
    where: {
      kind: input.claim.kind,
      subjectKey: input.claim.subjectKey,
      claimedAt: { gte: windowStart },
    },
  });
  if (recentCount >= input.configuration.maxRepeatsPerSubject) {
    return { allowed: false, reason: 'loop' };
  }
  try {
    await input.prisma.guardrailClaim.create({
      data: {
        kind: input.claim.kind,
        subjectKey: input.claim.subjectKey,
        fingerprint: input.claim.fingerprint,
        ticketId: input.claim.ticketId ?? null,
        actorUserId: input.claim.actorUserId ?? null,
        claimedAt: now,
        expiresAt: new Date(
          now.getTime() + input.configuration.duplicateWindowMinutes * 60_000,
        ),
      },
    });
    return { allowed: true, reason: 'claimed' };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { allowed: false, reason: 'duplicate' };
    }
    throw error;
  }
}

export function automationFingerprint(
  action: string,
  triggerIdentity: string,
): string {
  return `${action}:${triggerIdentity}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

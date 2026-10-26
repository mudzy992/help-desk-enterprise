import type { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type {
  GuardrailClaimDecision,
  GuardrailClaimInput,
  TicketGuardrailsConfiguration,
} from "./guardrails.types";
import { acquireGuardrailSubjectLock } from "./acquire-guardrail-subject-lock";

export async function claimGuardrailTrigger(input: {
  readonly prisma: PrismaService;
  readonly configuration: TicketGuardrailsConfiguration;
  readonly claim: GuardrailClaimInput;
}): Promise<GuardrailClaimDecision> {
  if (!input.configuration.enabled)
    return { allowed: true, reason: "disabled" };
  const execute = (transaction: Prisma.TransactionClient) =>
    claimLocked(transaction, input);
  // A TransactionClient deliberately has no nested $transaction. Callers such
  // as automation effects already own the transaction; direct callers get one.
  if (typeof input.prisma.$queryRaw !== "function") {
    return execute(input.prisma as unknown as Prisma.TransactionClient);
  }
  return typeof input.prisma.$transaction === "function"
    ? input.prisma.$transaction(execute)
    : execute(input.prisma as unknown as Prisma.TransactionClient);
}

async function claimLocked(
  transaction: Prisma.TransactionClient,
  input: {
    readonly configuration: TicketGuardrailsConfiguration;
    readonly claim: GuardrailClaimInput;
  },
): Promise<GuardrailClaimDecision> {
  await acquireGuardrailSubjectLock(
    transaction,
    `${input.claim.kind}:${input.claim.subjectKey}`,
  );
  const now = input.claim.now ?? new Date();
  const windowStart = new Date(
    now.getTime() - input.configuration.duplicateWindowMinutes * 60_000,
  );
  const recentCount = await transaction.guardrailClaim.count({
    where: {
      kind: input.claim.kind,
      subjectKey: input.claim.subjectKey,
      claimedAt: { gte: windowStart },
    },
  });
  if (recentCount >= input.configuration.maxRepeatsPerSubject)
    return { allowed: false, reason: "loop" };
  try {
    await transaction.guardrailClaim.create({
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
    return { allowed: true, reason: "claimed" };
  } catch (error) {
    if (isUniqueConstraintError(error))
      return { allowed: false, reason: "duplicate" };
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
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

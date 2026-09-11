import type { GuardrailClaimRecord } from '../guardrails/guardrails.types';

type GuardrailClaimWhere = {
  kind?: string;
  subjectKey?: string;
  fingerprint?: string;
  claimedAt?: { gte?: Date };
};

export function createInMemoryGuardrailClaimDelegate(
  claims: Map<string, GuardrailClaimRecord>,
  nextId: () => string,
  now: () => Date,
) {
  return {
    count: async ({ where }: { where?: GuardrailClaimWhere } = {}) =>
      [...claims.values()].filter((claim) => matchesClaim(claim, where)).length,
    findMany: async ({ where }: { where?: GuardrailClaimWhere } = {}) =>
      [...claims.values()].filter((claim) => matchesClaim(claim, where)),
    create: async ({
      data,
    }: {
      data: Omit<GuardrailClaimRecord, 'id'> & { id?: string };
    }) => {
      const duplicate = [...claims.values()].some(
        (claim) =>
          claim.kind === data.kind &&
          claim.subjectKey === data.subjectKey &&
          claim.fingerprint === data.fingerprint,
      );
      if (duplicate) {
        throw { code: 'P2002', meta: { target: ['kind', 'subjectKey', 'fingerprint'] } };
      }
      const created: GuardrailClaimRecord = {
        id: data.id ?? nextId(),
        kind: data.kind,
        subjectKey: data.subjectKey,
        fingerprint: data.fingerprint,
        ticketId: data.ticketId,
        actorUserId: data.actorUserId,
        claimedAt: data.claimedAt ?? now(),
        expiresAt: data.expiresAt,
      };
      claims.set(created.id, created);
      return created;
    },
  };
}

function matchesClaim(
  claim: GuardrailClaimRecord,
  where?: GuardrailClaimWhere,
): boolean {
  if (where === undefined) {
    return true;
  }
  if (where.kind !== undefined && claim.kind !== where.kind) {
    return false;
  }
  if (where.subjectKey !== undefined && claim.subjectKey !== where.subjectKey) {
    return false;
  }
  if (where.fingerprint !== undefined && claim.fingerprint !== where.fingerprint) {
    return false;
  }
  if (
    where.claimedAt?.gte !== undefined &&
    claim.claimedAt.getTime() < where.claimedAt.gte.getTime()
  ) {
    return false;
  }
  return true;
}

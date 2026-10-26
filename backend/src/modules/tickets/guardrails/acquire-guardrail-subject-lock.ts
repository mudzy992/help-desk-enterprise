import type { Prisma } from "../../../generated/prisma/client";

export async function acquireGuardrailSubjectLock(
  transaction: Prisma.TransactionClient,
  subjectKey: string,
): Promise<void> {
  if (typeof transaction.$queryRaw !== "function") return;
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${subjectKey}))`;
}

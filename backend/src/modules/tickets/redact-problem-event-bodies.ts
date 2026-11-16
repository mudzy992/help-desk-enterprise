import type { PrismaService } from '../../common/prisma/prisma.service';
import { problemPrincipalScope } from '../problems/problem-principal-scope';

const problemEventActions = new Set(['ticket_problem_linked', 'ticket_problem_unlinked', 'ticket_problem_takeover']);

/**
 * Legacy rows stored `action:<problemId>|<number> <title>`. A ticket reader
 * without problem.read in scope must not see the problem behind the ticket, so
 * the detail is dropped and the generic action label remains.
 */
export function redactProblemEventBody(body: string, readable: ReadonlySet<string>): string {
  const separator = body.indexOf(':');
  if (separator === -1) return body;
  const action = body.slice(0, separator).trim();
  if (!problemEventActions.has(action)) return body;
  const problemId = body.slice(separator + 1).split('|')[0]?.trim() ?? '';
  if (problemId.length > 0 && readable.has(problemId)) return body;
  return action;
}

export async function redactProblemEventBodies<T extends { readonly body: string }>(
  prisma: PrismaService,
  userId: string,
  records: readonly T[],
): Promise<readonly T[]> {
  const ids = new Set<string>();
  for (const record of records) {
    const separator = record.body.indexOf(':');
    if (separator === -1 || !problemEventActions.has(record.body.slice(0, separator).trim())) continue;
    const problemId = record.body.slice(separator + 1).split('|')[0]?.trim() ?? '';
    if (problemId.length > 0) ids.add(problemId);
  }
  if (ids.size === 0) return records;
  const scope = await problemPrincipalScope(prisma, userId);
  const readable = new Set(
    (await prisma.problem.findMany({ where: { AND: [scope ?? {}, { id: { in: [...ids] } }] }, select: { id: true } })).map((row) => row.id),
  );
  return records.map((record) => ({ ...record, body: redactProblemEventBody(record.body, readable) }));
}

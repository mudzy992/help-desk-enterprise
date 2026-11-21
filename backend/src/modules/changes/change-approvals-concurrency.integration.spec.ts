import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { changeVoterSnapshotOf, countSnapshotVotes } from './change-voter-snapshot';

/**
 * W7.78 (`BA-changes-20`): the guarantees the CAB vote leans on are database
 * facts, not conventions — one vote per voter and round, one transition per
 * version, a snapshot that survives the JSON round trip, and votes that leave
 * with their change. The unit specs cover the service's ordering; this file
 * proves the substrate under a real PostgreSQL, where two writers actually race.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('change approvals concurrency (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  let organizationalUnitId = '';
  let voterAId = '';
  let voterBId = '';
  let lateMemberId = '';
  let sequence = 0;
  const changeIds: string[] = [];

  beforeAll(async () => {
    const suffix = `${process.pid}-${Date.now()}`;
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await database().organizationalUnit.create({
      data: {
        name: `IT changes ${suffix}`,
        type: 'SECTOR',
        distinguishedName: `OU=it-changes-${suffix},DC=e2e,DC=test`,
        ouPath: `/it-changes-${suffix}`,
      },
    });
    organizationalUnitId = unit.id;
    const [voterA, voterB, lateMember] = await Promise.all([
      database().user.create({ data: { email: `it-voter-a-${suffix}@example.test`, displayName: 'IT voter A' } }),
      database().user.create({ data: { email: `it-voter-b-${suffix}@example.test`, displayName: 'IT voter B' } }),
      // A real user who joins the CAB after the round opened: the vote row is valid,
      // it simply is not part of the frozen set.
      database().user.create({ data: { email: `it-voter-late-${suffix}@example.test`, displayName: 'IT voter late' } }),
    ]);
    voterAId = voterA.id;
    voterBId = voterB.id;
    lateMemberId = lateMember.id;
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    if (changeIds.length > 0) await db.changeRequest.deleteMany({ where: { id: { in: changeIds } } });
    const voterIds = [voterAId, voterBId, lateMemberId].filter((id) => id !== '');
    if (voterIds.length > 0) await db.user.deleteMany({ where: { id: { in: voterIds } } });
    if (organizationalUnitId !== '') await db.organizationalUnit.delete({ where: { id: organizationalUnitId } });
    await db.$disconnect();
  });

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  async function createChange(overrides: Record<string, unknown> = {}): Promise<string> {
    sequence += 1;
    const change = await database().changeRequest.create({
      data: {
        sequence: 900_000 + sequence,
        title: `IT promjena ${sequence}`,
        description: 'Integracijski test glasovanja.',
        reason: 'Provjera kvoruma i transakcija.',
        organizationalUnitId,
        status: 'AUTHORIZATION',
        version: 1,
        approvalRound: 1,
        ...overrides,
      },
      select: { id: true },
    });
    changeIds.push(change.id);
    return change.id;
  }

  it('allows exactly one vote per approver and round, even when both arrive at once', async () => {
    const changeId = await createChange();
    const vote = () =>
      database().changeApproval.create({
        data: { changeId, round: 1, approverUserId: voterAId, decision: 'APPROVED' },
      });

    const results = await Promise.allSettled([vote(), vote()]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: 'P2002' } });
    expect(await database().changeApproval.count({ where: { changeId, round: 1 } })).toBe(1);
  });

  it('still lets the same approver vote in the next round', async () => {
    const changeId = await createChange({ approvalRound: 2 });

    await database().changeApproval.createMany({
      data: [
        { changeId, round: 1, approverUserId: voterAId, decision: 'REJECTED' },
        { changeId, round: 2, approverUserId: voterAId, decision: 'APPROVED' },
      ],
    });

    expect(await database().changeApproval.count({ where: { changeId } })).toBe(2);
  });

  it('moves the round once when two voters hold the same version', async () => {
    const changeId = await createChange();
    // The state both voters read: AUTHORIZATION at version 1.
    const transition = () =>
      database().changeRequest.updateMany({
        where: { id: changeId, version: 1, status: 'AUTHORIZATION' },
        data: { status: 'SCHEDULED', version: { increment: 1 } },
      });

    const [first, second] = await Promise.all([transition(), transition()]);

    // One guarded update matches, the other matches nothing — it cannot overwrite
    // the decision the winner just made.
    expect([first.count, second.count].sort()).toEqual([0, 1]);
    const stored = await database().changeRequest.findUniqueOrThrow({
      where: { id: changeId },
      select: { status: true, version: true },
    });
    expect(stored).toEqual({ status: 'SCHEDULED', version: 2 });
  });

  it('counts only the votes of the round that was frozen when AUTHORIZATION opened', async () => {
    const changeId = await createChange({ approvalRound: 1 });
    const frozen = { round: 1, voters: [voterAId, voterBId], quorum: 2 };
    // The opening event carries the snapshot; a member who joined later is written
    // as an approval row, which is exactly what a second replica could do.
    await database().changeEvent.create({
      data: {
        changeId,
        action: 'status',
        detail: { from: 'ASSESSMENT', to: 'AUTHORIZATION', action: 'authorize', round: 1, voterSnapshot: frozen },
      },
    });
    await database().changeApproval.createMany({
      data: [
        { changeId, round: 1, approverUserId: voterAId, decision: 'APPROVED' },
        { changeId, round: 1, approverUserId: lateMemberId, decision: 'APPROVED' },
      ],
    });

    const event = await database().changeEvent.findFirstOrThrow({
      where: { changeId, action: 'status' },
      select: { detail: true },
    });
    const read = changeVoterSnapshotOf(event.detail);
    expect(read).toEqual(frozen);

    const votes = await database().changeApproval.findMany({
      where: { changeId, round: 1 },
      select: { approverUserId: true, decision: true },
    });
    // The late member's row cannot satisfy the quorum of this round.
    expect(countSnapshotVotes(votes, read!)).toHaveLength(1);
  });

  it('takes the approvals and the events with the change', async () => {
    const changeId = await createChange();
    await database().changeApproval.create({
      data: { changeId, round: 1, approverUserId: voterBId, decision: 'APPROVED' },
    });
    await database().changeEvent.create({ data: { changeId, action: 'approval', detail: { round: 1 } } });

    await database().changeRequest.delete({ where: { id: changeId } });

    expect(await database().changeApproval.count({ where: { changeId } })).toBe(0);
    expect(await database().changeEvent.count({ where: { changeId } })).toBe(0);
  });
});

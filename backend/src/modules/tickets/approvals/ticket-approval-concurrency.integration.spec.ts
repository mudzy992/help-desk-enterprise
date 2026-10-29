import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";
import { claimTicketApprovalDecision } from "./claim-ticket-approval-decision";

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase("ticket approval concurrency boundary", () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  const stamp = Date.now();
  let ticketId: string;
  let actorId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    const unit = await prisma.organizationalUnit.create({
      data: {
        name: `Approval ${stamp}`,
        type: "DIRECTORATE",
        distinguishedName: `OU=APR${stamp}`,
        ouPath: `/apr${stamp}`,
      },
    });
    const category = await prisma.serviceCategory.create({
      data: { name: `Approval ${stamp}`, slug: `apr-cat-${stamp}` },
    });
    const service = await prisma.service.create({
      data: {
        name: `Approval ${stamp}`,
        slug: `apr-svc-${stamp}`,
        categoryId: category.id,
        lifecycle: "ACTIVE",
      },
    });
    const form = await prisma.formVersion.create({
      data: { serviceId: service.id, version: 1, schema: {} },
    });
    const actor = await prisma.user.create({
      data: {
        email: `approval-${stamp}@example.test`,
        displayName: "Approval actor",
      },
    });
    actorId = actor.id;
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `APR-${stamp}`,
        title: "Concurrent approval",
        description: "proof",
        formData: {},
        priority: "LOW",
        impact: "LOW",
        urgency: "LOW",
        status: "PENDING_APPROVAL",
        serviceId: service.id,
        formVersionId: form.id,
        requesterId: actor.id,
        originUnitId: unit.id,
      } as never,
    });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.ticket
      .delete({ where: { id: ticketId } })
      .catch(() => undefined);
    await prisma.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("permits exactly one of 20 parallel decisions and keeps one approval per step", async () => {
    const approval = await prisma.ticketApproval.create({
      data: { ticketId, stepOrder: 1 },
    });
    const outcomes = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        prisma.$transaction(async (transaction) => {
          await claimTicketApprovalDecision({
            transaction,
            approvalId: approval.id,
            ticketId,
            expectedTicketStatus: "PENDING_APPROVAL",
            nextTicketStatus: index % 2 === 0 ? "PENDING" : "CLOSED",
            decision: index % 2 === 0 ? "APPROVED" : "REJECTED",
            approverUserId: actorId,
            comment: `decision-${index}`,
            decidedAt: new Date(),
            ticketTimestamps: {},
          });
        }),
      ),
    );
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((result) => result.status === "rejected"),
    ).toHaveLength(19);
    expect(
      await prisma.ticketApproval.count({ where: { ticketId, stepOrder: 1 } }),
    ).toBe(1);
    const stored = await prisma.ticketApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    expect(stored.status === "APPROVED" ? ticket.status : "CLOSED").toBe(
      ticket.status,
    );
    await expect(
      prisma.ticketApproval.create({ data: { ticketId, stepOrder: 1 } }),
    ).rejects.toThrow();
  });
});

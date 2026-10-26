import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";
import { claimGuardrailTrigger } from "./claim-guardrail-trigger";
import { runGuardrailEffectTransaction } from "./run-guardrail-effect-transaction";
import type { TicketPersistedMessageSink } from "../collaboration.types";

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase("guardrail claim and protected effect transaction", () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let ticketId: string;
  let actorId: string;
  const stamp = Date.now();
  const fingerprint = `fault-${stamp}`;
  const configuration = {
    enabled: true,
    mode: "soft_block",
    duplicateWindowMinutes: 60,
    maxRepeatsPerSubject: 5,
    similarityThreshold: 0.8,
    confirmAboveRecipients: 20,
  } as const;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    const unit = await prisma.organizationalUnit.create({
      data: {
        name: `Guardrail ${stamp}`,
        type: "DIRECTORATE",
        distinguishedName: `OU=GR${stamp}`,
        ouPath: `/gr${stamp}`,
      },
    });
    const category = await prisma.serviceCategory.create({
      data: { name: `Guardrail ${stamp}`, slug: `gr-cat-${stamp}` },
    });
    const service = await prisma.service.create({
      data: {
        name: `Guardrail ${stamp}`,
        slug: `gr-svc-${stamp}`,
        categoryId: category.id,
        lifecycle: "ACTIVE",
      },
    });
    const form = await prisma.formVersion.create({
      data: { serviceId: service.id, version: 1, schema: {} },
    });
    const actor = await prisma.user.create({
      data: {
        email: `guardrail-${stamp}@example.test`,
        displayName: "Guardrail actor",
      },
    });
    actorId = actor.id;
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `GR-${stamp}`,
        title: "Before effect",
        description: "proof",
        formData: {},
        priority: "LOW",
        impact: "LOW",
        urgency: "LOW",
        status: "WAITING_FOR_USER",
        serviceId: service.id,
        formVersionId: form.id,
        requesterId: actor.id,
        originUnitId: unit.id,
      } as never,
    });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.guardrailClaim.deleteMany({ where: { fingerprint } });
    await prisma.ticket
      .delete({ where: { id: ticketId } })
      .catch(() => undefined);
    await prisma.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("rolls claim, effect and message back after a fault, then permits one retry", async () => {
    const messages: TicketPersistedMessageSink = [];
    const execute = (fail: boolean) =>
      runGuardrailEffectTransaction({
        prisma: prisma as never,
        messages,
        operation: async (transaction) => {
          const decision = await claimGuardrailTrigger({
            prisma: transaction as never,
            configuration,
            claim: {
              kind: "automation",
              subjectKey: ticketId,
              fingerprint,
              ticketId,
              actorUserId: actorId,
            },
          });
          expect(decision.allowed).toBe(true);
          await transaction.ticket.update({
            where: { id: ticketId },
            data: { title: "Effect committed" },
          });
          messages.push(
            (await transaction.ticketMessage.create({
              data: {
                ticketId,
                type: "SYSTEM_EVENT",
                body: "guardrail effect proof",
                authorUserId: null,
              },
            })) as never,
          );
          if (fail) throw new Error("INJECTED_EFFECT_FAULT");
        },
      });

    await expect(execute(true)).rejects.toThrow("INJECTED_EFFECT_FAULT");
    expect(messages).toHaveLength(0);
    expect(await prisma.guardrailClaim.count({ where: { fingerprint } })).toBe(
      0,
    );
    expect(
      (await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } }))
        .title,
    ).toBe("Before effect");
    expect(
      await prisma.ticketMessage.count({
        where: { ticketId, body: "guardrail effect proof" },
      }),
    ).toBe(0);

    await execute(false);
    expect(await prisma.guardrailClaim.count({ where: { fingerprint } })).toBe(
      1,
    );
    expect(
      (await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } }))
        .title,
    ).toBe("Effect committed");
    expect(
      await prisma.ticketMessage.count({
        where: { ticketId, body: "guardrail effect proof" },
      }),
    ).toBe(1);
  });
});

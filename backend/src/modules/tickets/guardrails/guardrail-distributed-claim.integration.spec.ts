import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";
import { claimGuardrailTrigger } from "./claim-guardrail-trigger";
import type { TicketGuardrailsConfiguration } from "./guardrails.types";

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase("distributed guardrail subject claim", () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  const stamp = Date.now();
  const subjectKey = `distributed-${stamp}`;
  const configuration: TicketGuardrailsConfiguration = {
    enabled: true,
    duplicateWindowMinutes: 60,
    maxRepeatsPerSubject: 3,
    similarityThreshold: 0.8,
    mode: "warn_only",
    confirmAboveRecipients: 200,
  };

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
  });
  afterAll(async () => {
    await prisma.guardrailClaim.deleteMany({ where: { subjectKey } });
    await prisma.$disconnect();
  });

  it("atomically limits distinct fingerprints across parallel callers", async () => {
    const decisions = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        claimGuardrailTrigger({
          prisma: prisma as never,
          configuration,
          claim: {
            kind: "event",
            subjectKey,
            fingerprint: `fingerprint-${index}`,
            now: new Date(),
          },
        }),
      ),
    );
    expect(
      decisions.filter((decision) => decision.reason === "claimed"),
    ).toHaveLength(3);
    expect(
      decisions.filter((decision) => decision.reason === "loop"),
    ).toHaveLength(17);
    expect(await prisma.guardrailClaim.count({ where: { subjectKey } })).toBe(
      3,
    );
  });
});

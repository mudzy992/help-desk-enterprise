import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";
import { defaultTicketArchiveConfiguration } from "../archive/archive.constants";
import { listTicketsForExport } from "../list-tickets";
import { buildTicketExportWhere } from "./export-tickets";
import { permissionKeys } from "../../authorization/authorization.constants";

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase("ticket export SQL scope and cursor boundary", () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  const stamp = Date.now();
  let actorId: string;
  const ticketIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("applies confidential and export-assignment scope before the cursor limit", async () => {
    const allowedUnit = await prisma.organizationalUnit.create({
      data: {
        name: `Allowed ${stamp}`,
        type: "DIRECTORATE",
        distinguishedName: `OU=EXPA${stamp}`,
        ouPath: `/expa${stamp}`,
      },
    });
    const deniedUnit = await prisma.organizationalUnit.create({
      data: {
        name: `Denied ${stamp}`,
        type: "DIRECTORATE",
        distinguishedName: `OU=EXPD${stamp}`,
        ouPath: `/expd${stamp}`,
      },
    });
    const category = await prisma.serviceCategory.create({
      data: { name: `Export ${stamp}`, slug: `exp-cat-${stamp}` },
    });
    const service = await prisma.service.create({
      data: {
        name: `Export ${stamp}`,
        slug: `exp-svc-${stamp}`,
        categoryId: category.id,
        lifecycle: "ACTIVE",
      },
    });
    const form = await prisma.formVersion.create({
      data: { serviceId: service.id, version: 1, schema: {} },
    });
    const actor = await prisma.user.create({
      data: {
        email: `export-${stamp}@example.test`,
        displayName: "Export actor",
      },
    });
    actorId = actor.id;
    const auth = {
      subjectId: actor.id,
      isLocalOnly: false,
      isSuperAdmin: false,
      assignments: [
        {
          roleKey: "AGENT",
          permissionKeys: [permissionKeys.auditExport],
          organizationalUnitId: allowedUnit.id,
          organizationalUnitPath: allowedUnit.ouPath,
          serviceId: null,
        },
      ],
    } as const;
    const base = {
      description: "export proof",
      formData: {},
      priority: "LOW",
      impact: "LOW",
      urgency: "LOW",
      status: "PENDING",
      serviceId: service.id,
      formVersionId: form.id,
      requesterId: actor.id,
    } as const;
    const rows = await Promise.all([
      prisma.ticket.create({
        data: {
          ...base,
          ticketNumber: `EXP-D-${stamp}`,
          title: "denied scope",
          originUnitId: deniedUnit.id,
        } as never,
      }),
      prisma.ticket.create({
        data: {
          ...base,
          ticketNumber: `EXP-C-${stamp}`,
          title: "confidential",
          originUnitId: allowedUnit.id,
          isConfidential: true,
        } as never,
      }),
      prisma.ticket.create({
        data: {
          ...base,
          ticketNumber: `EXP-A1-${stamp}`,
          title: "eligible one",
          originUnitId: allowedUnit.id,
        } as never,
      }),
      prisma.ticket.create({
        data: {
          ...base,
          ticketNumber: `EXP-A2-${stamp}`,
          title: "eligible two",
          originUnitId: allowedUnit.id,
        } as never,
      }),
    ]);
    ticketIds.push(...rows.map((row) => row.id));
    const result = await listTicketsForExport(
      prisma as never,
      { loadBySubjectId: async () => auth } as never,
      {},
      { actorUserId: actor.id },
      defaultTicketArchiveConfiguration,
      2,
      buildTicketExportWhere(auth),
    );
    expect(result.map((ticket) => ticket.title).sort()).toEqual([
      "eligible one",
      "eligible two",
    ]);
  });
});

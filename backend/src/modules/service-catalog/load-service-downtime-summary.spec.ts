import { createInMemoryServiceCatalogPrisma } from "./create-in-memory-service-catalog-prisma";
import { defaultServiceLifecycleConfiguration } from "./service-catalog.constants";
import { ServiceCatalogService } from "./service-catalog.service";
import { loadServiceDowntimeSummary } from "./load-service-downtime-summary";

jest.mock("../../common/prisma/prisma.service", () => ({
  PrismaService: class PrismaService {},
}));

describe("loadServiceDowntimeSummary", () => {
  it("returns at most one active and nearest upcoming window while keeping the exact count", async () => {
    const memory = createInMemoryServiceCatalogPrisma();
    const serviceCatalog = new ServiceCatalogService(
      memory.prisma as never,
      { load: async () => defaultServiceLifecycleConfiguration } as never,
    );
    const category = await serviceCatalog.createCategory({
      name: "IT",
      slug: "it",
    });
    const service = await serviceCatalog.create({
      name: "VPN access",
      slug: "vpn-access",
      categoryId: category.id,
    });
    const now = new Date("2026-09-10T10:00:00.000Z");
    const delegate = memory.prisma.serviceDowntimeWindow as unknown as {
      create: (input: {
        data: {
          serviceId: string;
          startsAt: Date;
          endsAt: Date;
          message: string;
        };
      }) => Promise<unknown>;
    };
    await delegate.create({
      data: {
        serviceId: service.id,
        startsAt: new Date("2026-09-10T09:00:00.000Z"),
        endsAt: new Date("2026-09-10T12:00:00.000Z"),
        message: "Active maintenance",
      },
    });
    for (let index = 0; index < 8; index += 1) {
      await delegate.create({
        data: {
          serviceId: service.id,
          startsAt: new Date(
            Date.parse("2026-09-11T10:00:00.000Z") + index * 60_000,
          ),
          endsAt: new Date(
            Date.parse("2026-09-11T11:00:00.000Z") + index * 60_000,
          ),
          message: `Future maintenance ${index + 1}`,
        },
      });
    }

    const summary = await loadServiceDowntimeSummary(
      memory.prisma as never,
      service.id,
      now,
    );
    expect(summary.upcomingCount).toBe(8);
    expect(summary.windows).toHaveLength(2);
    expect(summary.windows.map((window) => window.message)).toEqual([
      "Active maintenance",
      "Future maintenance 1",
    ]);
  });
});

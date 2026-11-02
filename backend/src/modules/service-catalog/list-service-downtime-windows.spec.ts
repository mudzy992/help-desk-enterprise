import { BadRequestException } from "@nestjs/common";
import { createInMemoryServiceCatalogPrisma } from "./create-in-memory-service-catalog-prisma";
import { defaultServiceLifecycleConfiguration } from "./service-catalog.constants";
import { ServiceCatalogService } from "./service-catalog.service";
import { listServiceDowntimeWindows } from "./list-service-downtime-windows";

jest.mock("../../common/prisma/prisma.service", () => ({
  PrismaService: class PrismaService {},
}));

const now = new Date("2026-09-10T10:00:00.000Z");
const from = "2026-09-09T00:00:00.000Z";
const to = "2026-09-20T00:00:00.000Z";

describe("GET /services/:serviceId/downtime-windows cursor pagination", () => {
  async function createHarness() {
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
    for (let index = 0; index < 5; index += 1) {
      await delegate.create({
        data: {
          serviceId: service.id,
          startsAt: new Date(
            Date.parse("2026-09-11T10:00:00.000Z") + index * 60_000,
          ),
          endsAt: new Date(
            Date.parse("2026-09-11T11:00:00.000Z") + index * 60_000,
          ),
          message: `Window ${index + 1}`,
        },
      });
    }
    return { memory, service };
  }

  it("bounds pages, reports the stable total, and binds cursors to the service period", async () => {
    const { memory, service } = await createHarness();
    const first = await listServiceDowntimeWindows(
      memory.prisma as never,
      service.id,
      now,
      { take: 2, from, to },
    );
    expect(first).toMatchObject({
      total: 5,
      take: 2,
      cursor: null,
      hasMore: true,
      period: { from, to },
    });
    expect(first.items.map((item) => item.message)).toEqual([
      "Window 1",
      "Window 2",
    ]);

    const second = await listServiceDowntimeWindows(
      memory.prisma as never,
      service.id,
      now,
      { take: 2, cursor: first.nextCursor ?? undefined, from, to },
    );
    expect(second.items.map((item) => item.message)).toEqual([
      "Window 3",
      "Window 4",
    ]);
    expect(second.hasMore).toBe(true);

    const last = await listServiceDowntimeWindows(
      memory.prisma as never,
      service.id,
      now,
      { take: 2, cursor: second.nextCursor ?? undefined, from, to },
    );
    expect(last.items.map((item) => item.message)).toEqual(["Window 5"]);
    expect(last).toMatchObject({ total: 5, hasMore: false, nextCursor: null });

    await expect(
      listServiceDowntimeWindows(memory.prisma as never, service.id, now, {
        take: 2,
        cursor: first.nextCursor ?? undefined,
        from,
        to: "2026-09-21T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects periods outside the configured maximum duration", async () => {
    const { memory, service } = await createHarness();
    await expect(
      listServiceDowntimeWindows(memory.prisma as never, service.id, now, {
        from: "2024-01-01T00:00:00.000Z",
        to: "2026-09-20T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

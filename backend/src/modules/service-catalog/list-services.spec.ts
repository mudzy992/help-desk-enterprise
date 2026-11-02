import { BadRequestException } from "@nestjs/common";
import { createInMemoryServiceCatalogPrisma } from "./create-in-memory-service-catalog-prisma";
import { ServiceCatalogService } from "./service-catalog.service";
import { defaultServiceLifecycleConfiguration } from "./service-catalog.constants";

jest.mock("../../common/prisma/prisma.service", () => ({
  PrismaService: class PrismaService {},
}));

describe("GET /services cursor pagination", () => {
  it("returns a stable name/id ordered page, total, hasMore, and a continuation cursor", async () => {
    const memory = createInMemoryServiceCatalogPrisma();
    const service = new ServiceCatalogService(
      memory.prisma as never,
      { load: async () => defaultServiceLifecycleConfiguration } as never,
    );
    const category = await service.createCategory({ name: "IT", slug: "it" });
    for (const name of [
      "Service C",
      "Service A",
      "Service D",
      "Service B",
      "Service E",
    ]) {
      await service.create({
        name,
        slug: name.toLowerCase().replaceAll(" ", "-"),
        categoryId: category.id,
      });
    }

    const first = await service.list({
      take: 2,
      visibleLifecycles: ["DRAFT"],
    });
    expect(first).toMatchObject({
      total: 5,
      take: 2,
      cursor: null,
      hasMore: true,
    });
    expect(first.items.map((item) => item.name)).toEqual([
      "Service A",
      "Service B",
    ]);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await service.list({
      take: 2,
      cursor: first.nextCursor ?? undefined,
      visibleLifecycles: ["DRAFT"],
    });
    expect(second).toMatchObject({ total: 5, take: 2, hasMore: true });
    expect(second.items.map((item) => item.name)).toEqual([
      "Service C",
      "Service D",
    ]);

    const last = await service.list({
      take: 2,
      cursor: second.nextCursor ?? undefined,
      visibleLifecycles: ["DRAFT"],
    });
    expect(last).toMatchObject({
      total: 5,
      take: 2,
      hasMore: false,
      nextCursor: null,
    });
    expect(last.items.map((item) => item.name)).toEqual(["Service E"]);
    expect(
      new Set(
        [...first.items, ...second.items, ...last.items].map((item) => item.id),
      ).size,
    ).toBe(5);
  });

  it("rejects a cursor when its filter set changes rather than mixing catalog results", async () => {
    const memory = createInMemoryServiceCatalogPrisma();
    const service = new ServiceCatalogService(
      memory.prisma as never,
      { load: async () => defaultServiceLifecycleConfiguration } as never,
    );
    const category = await service.createCategory({ name: "IT", slug: "it" });
    for (let index = 0; index < 3; index += 1) {
      await service.create({
        name: `Service ${index}`,
        slug: `service-${index}`,
        categoryId: category.id,
      });
    }
    const first = await service.list({ take: 1, visibleLifecycles: ["DRAFT"] });
    expect(first.nextCursor).toEqual(expect.any(String));
    await expect(
      service.list({
        take: 1,
        cursor: first.nextCursor ?? undefined,
        search: "different-filter",
        visibleLifecycles: ["DRAFT"],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("honours the caller lifecycle visibility and bounds the response by the requested page size", async () => {
    const memory = createInMemoryServiceCatalogPrisma();
    const service = new ServiceCatalogService(
      memory.prisma as never,
      { load: async () => defaultServiceLifecycleConfiguration } as never,
    );
    const category = await service.createCategory({ name: "IT", slug: "it" });
    for (let index = 0; index < 4; index += 1) {
      await service.create({
        name: `Draft ${index}`,
        slug: `draft-${index}`,
        categoryId: category.id,
      });
    }

    const hidden = await service.list({
      lifecycle: "ACTIVE",
      visibleLifecycles: ["DRAFT"],
    });
    const bounded = await service.list({
      take: 2,
      visibleLifecycles: ["DRAFT"],
    });
    expect(hidden).toMatchObject({
      items: [],
      total: 0,
      hasMore: false,
      nextCursor: null,
    });
    expect(bounded).toMatchObject({ total: 4, take: 2, hasMore: true });
    expect(bounded.items).toHaveLength(2);
  });
});

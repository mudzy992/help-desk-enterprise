import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { serviceDowntimeWindowListMaximumResponseBytes } from "./service-availability.constants";
import {
  defaultServiceLifecycleConfiguration,
  serviceCategoryListMaximumResponseBytes,
  serviceListMaximumResponseBytes,
} from "./service-catalog.constants";
import { ServiceAvailabilityService } from "./service-availability.service";
import { serviceFormVersionsMaximumResponseBytes } from "./service-forms.constants";
import { ServiceFormsService } from "./service-forms.service";
import { ServiceCatalogService } from "./service-catalog.service";

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;
const fixtureServiceCount = 500;
const fixtureCategoryCount = 126;
const fixtureFormVersionCount = 75;
const fixtureDowntimeCount = 125;
const servicePageSize = 100;
const categoryPageSize = 100;
const formPageSize = 50;
const downtimePageSize = 100;
const maximumServicePageQueries = 10;
const stamp = `${Date.now()}${process.pid}`;
const categorySlugPrefix = `ba10-pagination-${stamp}`;
const serviceSlugPrefix = `ba10-service-${stamp}-`;
const seededAt = new Date("2026-10-01T00:00:00.000Z");
const downtimeFrom = "2030-01-01T00:00:00.000Z";
const downtimeTo = "2030-01-03T00:00:00.000Z";
const downtimeFromMs = Date.parse(downtimeFrom);
const activeFormSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: "summary_field",
      label: "Summary field",
      type: "text",
      required: true,
      order: 0,
    },
  ],
};

function flushQueryEvents(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describeIfDatabase(
  "service catalog bounded reads (PostgreSQL integration, BA-10)",
  () => {
    jest.setTimeout(120_000);
    let prisma: PrismaClient | undefined;
    let categoryId: string | undefined;
    let serviceId: string | undefined;
    let baselineCategoryCount = 0;
    let queryCount = 0;

    beforeAll(async () => {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
        log: [{ emit: "event", level: "query" }],
      });
      // Prisma 7's generated client types `query` as `never` for this adapter
      // even though the configured runtime log emitter supports query events.
      const queryEventClient = prisma as unknown as {
        $on: (event: "query", listener: (event: unknown) => void) => void;
      };
      queryEventClient.$on("query", () => {
        queryCount += 1;
      });

      baselineCategoryCount = await prisma.serviceCategory.count();
      const primaryCategory = await prisma.serviceCategory.create({
        data: {
          name: `BA-10 category 0000 ${stamp}`,
          slug: categorySlugPrefix,
          sortOrder: 100_000,
        },
        select: { id: true },
      });
      categoryId = primaryCategory.id;
      await prisma.serviceCategory.createMany({
        data: Array.from({ length: fixtureCategoryCount - 1 }, (_, index) => {
          const ordinal = String(index + 1).padStart(4, "0");
          return {
            name: `BA-10 category ${ordinal} ${stamp}`,
            slug: `${categorySlugPrefix}-${ordinal}`,
            sortOrder: 100_000,
            createdAt: seededAt,
            updatedAt: seededAt,
          };
        }),
      });

      await prisma.service.createMany({
        data: Array.from({ length: fixtureServiceCount }, (_, index) => {
          const ordinal = String(index).padStart(4, "0");
          return {
            name: `BA-10 service ${ordinal} ${stamp}`,
            slug: `${serviceSlugPrefix}${ordinal}`,
            categoryId: primaryCategory.id,
            lifecycle: "ACTIVE" as const,
            createdAt: seededAt,
            updatedAt: seededAt,
          };
        }),
      });
      const firstService = await prisma.service.findUnique({
        where: { slug: `${serviceSlugPrefix}0000` },
        select: { id: true },
      });
      if (firstService === null)
        throw new Error("BA-10 fixture service nije kreiran");
      serviceId = firstService.id;

      await prisma.formVersion.createMany({
        data: Array.from({ length: fixtureFormVersionCount }, (_, index) => {
          const version = index + 1;
          return {
            serviceId: firstService.id,
            version,
            schema:
              version === fixtureFormVersionCount
                ? activeFormSchema
                : { schemaVersion: 1, fields: [] },
            status:
              version === fixtureFormVersionCount
                ? ("ACTIVE" as const)
                : ("DRAFT" as const),
            createdAt: seededAt,
            updatedAt: seededAt,
          };
        }),
      });

      const insidePeriod = Array.from(
        { length: fixtureDowntimeCount },
        (_, index) => {
          const startsAt = new Date(downtimeFromMs + index * 10 * 60_000);
          return {
            serviceId: firstService.id,
            startsAt,
            endsAt: new Date(startsAt.getTime() + 5 * 60_000),
            message: `BA-10 window ${String(index).padStart(3, "0")}`,
            createdAt: seededAt,
            updatedAt: seededAt,
          };
        },
      );
      await prisma.serviceDowntimeWindow.createMany({
        data: [
          ...insidePeriod,
          {
            serviceId: firstService.id,
            startsAt: new Date(downtimeFromMs - 60 * 60_000),
            endsAt: new Date(downtimeFromMs - 60_000),
            message: "BA-10 outside before period",
            createdAt: seededAt,
            updatedAt: seededAt,
          },
          {
            serviceId: firstService.id,
            startsAt: new Date(Date.parse(downtimeTo) + 60_000),
            endsAt: new Date(Date.parse(downtimeTo) + 6 * 60_000),
            message: "BA-10 outside after period",
            createdAt: seededAt,
            updatedAt: seededAt,
          },
        ],
      });
    });

    afterAll(async () => {
      if (prisma !== undefined) {
        const fixtureServices = await prisma.service.findMany({
          where: { slug: { startsWith: serviceSlugPrefix } },
          select: { id: true },
        });
        const fixtureServiceIds = fixtureServices.map((service) => service.id);
        if (fixtureServiceIds.length > 0) {
          await prisma.formVersion.deleteMany({
            where: { serviceId: { in: fixtureServiceIds } },
          });
          await prisma.serviceDowntimeWindow.deleteMany({
            where: { serviceId: { in: fixtureServiceIds } },
          });
          await prisma.service.deleteMany({
            where: { id: { in: fixtureServiceIds } },
          });
        }
        await prisma.serviceCategory.deleteMany({
          where: { slug: { startsWith: categorySlugPrefix } },
        });
        await prisma.$disconnect();
      }
    });

    it("paginates 500 services in stable pages and keeps related reads and payload bounded", async () => {
      const catalog = new ServiceCatalogService(
        prisma as never,
        { load: async () => defaultServiceLifecycleConfiguration } as never,
      );
      const input = {
        take: servicePageSize,
        categoryId,
        search: stamp,
        visibleLifecycles: ["ACTIVE"] as const,
      };
      const readPage = async (cursor?: string) => {
        queryCount = 0;
        const result = await catalog.list({ ...input, cursor });
        await flushQueryEvents();
        expect(queryCount).toBeGreaterThan(0);
        expect(queryCount).toBeLessThanOrEqual(maximumServicePageQueries);
        return result;
      };

      let page = await readPage();
      expect(page.total).toBe(fixtureServiceCount);
      expect(page.take).toBe(servicePageSize);
      expect(page.items).toHaveLength(servicePageSize);
      expect(page.hasMore).toBe(true);
      expect(
        Buffer.byteLength(JSON.stringify(page), "utf8"),
      ).toBeLessThanOrEqual(serviceListMaximumResponseBytes);
      const projectedService = page.items.find((item) => item.id === serviceId);
      expect(projectedService?.activeForm).toEqual({
        activeFormVersionRef: expect.any(String),
        version: fixtureFormVersionCount,
        fieldCount: 1,
      });
      expect(projectedService?.activeForm).not.toHaveProperty("schema");

      const ids = new Set<string>();
      const names = new Set<string>();
      const orderedNames: string[] = [];
      let pageCount = 0;
      while (true) {
        pageCount += 1;
        expect(page.total).toBe(fixtureServiceCount);
        expect(page.items.length).toBeLessThanOrEqual(servicePageSize);
        expect(
          Buffer.byteLength(JSON.stringify(page), "utf8"),
        ).toBeLessThanOrEqual(serviceListMaximumResponseBytes);
        for (const item of page.items) {
          ids.add(item.id);
          names.add(item.name);
          orderedNames.push(item.name);
        }
        if (!page.hasMore) break;
        expect(page.nextCursor).toEqual(expect.any(String));
        page = await readPage(page.nextCursor ?? undefined);
      }

      expect(pageCount).toBe(Math.ceil(fixtureServiceCount / servicePageSize));
      expect(ids.size).toBe(fixtureServiceCount);
      expect(names.size).toBe(fixtureServiceCount);
      expect(orderedNames).toEqual(
        Array.from({ length: fixtureServiceCount }, (_, index) => {
          const ordinal = String(index).padStart(4, "0");
          return `BA-10 service ${ordinal} ${stamp}`;
        }),
      );
      expect(page.nextCursor).toBeNull();
    });

    it("paginates the category envelope without duplicates or oversized responses", async () => {
      const catalog = new ServiceCatalogService(
        prisma as never,
        { load: async () => defaultServiceLifecycleConfiguration } as never,
      );
      const ids = new Set<string>();
      const slugs = new Set<string>();
      let cursor: string | undefined;
      let pageCount = 0;
      const expectedTotal = baselineCategoryCount + fixtureCategoryCount;

      while (true) {
        queryCount = 0;
        const page = await catalog.listCategories({
          take: categoryPageSize,
          cursor,
        });
        await flushQueryEvents();
        pageCount += 1;
        expect(queryCount).toBeGreaterThan(0);
        expect(queryCount).toBeLessThanOrEqual(2);
        expect(page.total).toBe(expectedTotal);
        expect(page.items.length).toBeLessThanOrEqual(categoryPageSize);
        expect(
          Buffer.byteLength(JSON.stringify(page), "utf8"),
        ).toBeLessThanOrEqual(serviceCategoryListMaximumResponseBytes);
        for (const item of page.items) {
          ids.add(item.id);
          slugs.add(item.slug);
        }
        if (!page.hasMore) {
          expect(page.nextCursor).toBeNull();
          break;
        }
        expect(page.nextCursor).toEqual(expect.any(String));
        cursor = page.nextCursor ?? undefined;
      }

      expect(pageCount).toBe(Math.ceil(expectedTotal / categoryPageSize));
      expect(ids.size).toBe(expectedTotal);
      for (let index = 0; index < fixtureCategoryCount; index += 1) {
        const ordinal = String(index).padStart(4, "0");
        expect(
          slugs.has(
            index === 0
              ? categorySlugPrefix
              : `${categorySlugPrefix}-${ordinal}`,
          ),
        ).toBe(true);
      }
    });

    it("bounds version history, keeps its envelope, and returns a page-scoped schema set", async () => {
      const forms = new ServiceFormsService(prisma as never);
      const readPage = async (cursor?: string) => {
        queryCount = 0;
        const result = await forms.getForm(serviceId!, undefined, {
          take: formPageSize,
          cursor,
        });
        await flushQueryEvents();
        expect(queryCount).toBeGreaterThan(0);
        expect(queryCount).toBeLessThanOrEqual(5);
        return result;
      };
      let page = await readPage();
      expect(page.total).toBe(fixtureFormVersionCount);
      expect(page.take).toBe(formPageSize);
      expect(page.versions).toHaveLength(formPageSize);
      expect(page.versions[0]?.version).toBe(fixtureFormVersionCount);
      expect(page.activeFormVersionRef).toEqual(expect.any(String));
      expect(page.activeForm).toBeNull();
      expect(page.hasMore).toBe(true);
      expect(
        Buffer.byteLength(JSON.stringify(page), "utf8"),
      ).toBeLessThanOrEqual(serviceFormVersionsMaximumResponseBytes);

      const versions: number[] = [];
      let pageCount = 0;
      while (true) {
        pageCount += 1;
        expect(page.total).toBe(fixtureFormVersionCount);
        expect(page.take).toBe(formPageSize);
        expect(page.versions.length).toBeLessThanOrEqual(formPageSize);
        expect(
          Buffer.byteLength(JSON.stringify(page), "utf8"),
        ).toBeLessThanOrEqual(serviceFormVersionsMaximumResponseBytes);
        versions.push(...page.versions.map((version) => version.version));
        if (!page.hasMore) break;
        expect(page.nextCursor).toEqual(expect.any(String));
        page = await readPage(page.nextCursor ?? undefined);
      }

      expect(pageCount).toBe(2);
      expect(versions).toEqual(
        Array.from(
          { length: fixtureFormVersionCount },
          (_, index) => fixtureFormVersionCount - index,
        ),
      );
      expect(page.nextCursor).toBeNull();
    });

    it("filters downtime by a bounded period and traverses 125 matching rows", async () => {
      const catalog = new ServiceCatalogService(
        prisma as never,
        { load: async () => defaultServiceLifecycleConfiguration } as never,
      );
      const availability = new ServiceAvailabilityService(
        prisma as never,
        catalog,
      );
      const now = new Date("2029-12-31T00:00:00.000Z");
      const input = {
        take: downtimePageSize,
        from: downtimeFrom,
        to: downtimeTo,
      };

      const readPage = async (cursor?: string) => {
        queryCount = 0;
        const result = await availability.listDowntimeWindows(
          serviceId!,
          { ...input, cursor },
          now,
        );
        await flushQueryEvents();
        expect(queryCount).toBeGreaterThan(0);
        expect(queryCount).toBeLessThanOrEqual(3);
        return result;
      };
      let page = await readPage();
      expect(page.total).toBe(fixtureDowntimeCount);
      expect(page.take).toBe(downtimePageSize);
      expect(page.items).toHaveLength(downtimePageSize);
      expect(page.hasMore).toBe(true);
      expect(page.period).toEqual({ from: downtimeFrom, to: downtimeTo });
      expect(
        Buffer.byteLength(JSON.stringify(page), "utf8"),
      ).toBeLessThanOrEqual(serviceDowntimeWindowListMaximumResponseBytes);

      const ids = new Set<string>();
      const orderedStarts: number[] = [];
      let pageCount = 0;
      while (true) {
        pageCount += 1;
        expect(page.total).toBe(fixtureDowntimeCount);
        expect(page.take).toBe(downtimePageSize);
        expect(page.period).toEqual({ from: downtimeFrom, to: downtimeTo });
        expect(
          Buffer.byteLength(JSON.stringify(page), "utf8"),
        ).toBeLessThanOrEqual(serviceDowntimeWindowListMaximumResponseBytes);
        for (const window of page.items) {
          ids.add(window.id);
          orderedStarts.push(Date.parse(window.startsAt));
        }
        if (!page.hasMore) break;
        expect(page.nextCursor).toEqual(expect.any(String));
        page = await readPage(page.nextCursor ?? undefined);
      }

      expect(pageCount).toBe(2);
      expect(ids.size).toBe(fixtureDowntimeCount);
      expect(orderedStarts).toEqual([...orderedStarts].sort((a, b) => a - b));
      expect(page.items).toHaveLength(fixtureDowntimeCount - downtimePageSize);
      expect(page.nextCursor).toBeNull();
    });
  },
);

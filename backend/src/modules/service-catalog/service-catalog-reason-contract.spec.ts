import { validate } from "class-validator";
import { CatalogMutationReasonDto } from "./dto/catalog-mutation-reason.dto";
import { CreateServiceCategoryDto } from "./dto/create-service-category.dto";
import { CreateServiceDto } from "./dto/create-service.dto";
import { CreateServiceFormDto } from "./dto/create-service-form.dto";
import { CreateServiceFormVersionDto } from "./dto/create-service-form-version.dto";
import { TransitionServiceLifecycleDto } from "./dto/transition-service-lifecycle.dto";
import { UpdateServiceCategoryDto } from "./dto/update-service-category.dto";
import { UpdateServiceDto } from "./dto/update-service.dto";
import { UpdateServiceFormVersionDto } from "./dto/update-service-form-version.dto";
import { createInMemoryServiceCatalogPrisma } from "./create-in-memory-service-catalog-prisma";
import { defaultServiceLifecycleConfiguration } from "./service-catalog.constants";
import { normalizeCatalogMutationReason } from "./normalize-catalog-mutation-reason";
import { ServiceCatalogError } from "./service-catalog.error";
import { ServiceCatalogService } from "./service-catalog.service";

jest.mock("../../common/prisma/prisma.service", () => ({
  PrismaService: class PrismaService {},
}));

type DtoConstructor = new () => object;

async function hasReasonValidationError(
  Dto: DtoConstructor,
  values: Record<string, unknown>,
): Promise<boolean> {
  const instance = Object.assign(new Dto(), values);
  const errors = await validate(instance);
  return errors.some((error) => error.property === "reason");
}

describe("service catalog caller-supplied audit reasons", () => {
  it("requires a reason on human category, service, lifecycle, and form mutation DTOs", async () => {
    const cases: readonly {
      readonly Dto: DtoConstructor;
      readonly values: Record<string, unknown>;
    }[] = [
      { Dto: CatalogMutationReasonDto, values: {} },
      {
        Dto: CreateServiceCategoryDto,
        values: { name: "Support", slug: "support" },
      },
      { Dto: UpdateServiceCategoryDto, values: { name: "Support" } },
      {
        Dto: CreateServiceDto,
        values: { name: "VPN", slug: "vpn", categoryId: "category-1" },
      },
      { Dto: UpdateServiceDto, values: { name: "VPN" } },
      { Dto: TransitionServiceLifecycleDto, values: { lifecycle: "ACTIVE" } },
      {
        Dto: CreateServiceFormDto,
        values: { schema: { schemaVersion: 1, fields: [] } },
      },
      {
        Dto: CreateServiceFormVersionDto,
        values: { schema: { schemaVersion: 1, fields: [] } },
      },
      {
        Dto: UpdateServiceFormVersionDto,
        values: { schema: { schemaVersion: 1, fields: [] } },
      },
    ];

    for (const { Dto, values } of cases) {
      await expect(hasReasonValidationError(Dto, values)).resolves.toBe(true);
    }
  });

  it("trims caller reasons, rejects blank human reasons, and keeps stable internal fallbacks", () => {
    expect(
      normalizeCatalogMutationReason({
        reason: "  Approved service update  ",
        context: { actorUserId: "admin-1" },
        systemFallback: "update",
      }),
    ).toBe("Approved service update");
    expect(
      normalizeCatalogMutationReason({
        reason: undefined,
        context: { actorUserId: null },
        systemFallback: "update",
      }),
    ).toBe("update");
    expect(() =>
      normalizeCatalogMutationReason({
        reason: "   ",
        context: { actorUserId: "admin-1" },
        systemFallback: "update",
      }),
    ).toThrow(new ServiceCatalogError("REASON_REQUIRED"));
  });

  it("persists normalized caller reasons for category/service create, update, and delete", async () => {
    const memory = createInMemoryServiceCatalogPrisma();
    const catalog = new ServiceCatalogService(
      memory.prisma as never,
      { load: async () => defaultServiceLifecycleConfiguration } as never,
    );
    const context = { actorUserId: "admin-1" };
    const category = await catalog.createCategory(
      {
        name: "Support",
        slug: "support",
        reason: "  Establish support group  ",
      },
      context,
    );
    await catalog.updateCategory(
      category.id,
      { name: "Customer support", reason: "  Clarify service ownership  " },
      '"v1"',
      context,
    );
    const service = await catalog.create(
      {
        name: "VPN",
        slug: "vpn",
        categoryId: category.id,
        reason: "  Provide remote access  ",
      },
      context,
    );
    await catalog.update(
      service.id,
      { name: "Remote access", reason: "  Use approved display name  " },
      '"v1"',
      context,
    );
    await catalog.delete(service.id, context, "  Retire unused draft  ");
    await catalog.deleteCategory(
      category.id,
      context,
      "  Remove empty group  ",
    );

    expect(memory.changeLogs.map((entry) => entry.reason)).toEqual([
      "Establish support group",
      "Clarify service ownership",
      "Provide remote access",
      "Use approved display name",
      "Retire unused draft",
      "Remove empty group",
    ]);
    expect(
      memory.changeLogs.map(
        (entry) => (entry.diff as { action?: string }).action,
      ),
    ).toEqual([
      "service_category.create",
      "service_category.update",
      "service.create",
      "service.update",
      "service.delete",
      "service_category.delete",
    ]);
    expect(
      memory.changeLogs.every((entry) => entry.actorUserId === "admin-1"),
    ).toBe(true);
  });
});

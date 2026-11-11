import { BadRequestException, ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../common/prisma/prisma.service";
import { createInMemoryServiceCatalogPrisma } from "./create-in-memory-service-catalog-prisma";
import { defaultServiceLifecycleConfiguration } from "./service-catalog.constants";
import { ServiceCatalogService } from "./service-catalog.service";
import { ServiceFormsConfigurationLoader } from "./service-forms-configuration.loader";
import { defaultServiceFormsConfiguration } from "./service-forms.constants";
import { ServiceFormsService } from "./service-forms.service";
import type { ServiceFormsConfiguration } from "./service-forms.types";

jest.mock("../../common/prisma/prisma.service", () => ({
  PrismaService: class PrismaService {},
}));

const validSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: "asset_tag",
      label: "Asset tag",
      type: "text",
      required: true,
      order: 0,
    },
  ],
};

const nextSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: "asset_tag",
      label: "Asset tag",
      type: "text",
      required: true,
      order: 0,
    },
    {
      id: "serial_number",
      label: "Serial number",
      type: "text",
      required: true,
      order: 1,
    },
  ],
};

describe("ServiceFormsService", () => {
  it("resolves the forms configuration loader through Nest DI", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ServiceFormsService,
        { provide: PrismaService, useValue: {} },
        {
          provide: ServiceFormsConfigurationLoader,
          useValue: { load: async () => undefined },
        },
      ],
    }).compile();
    expect(moduleRef.get(ServiceFormsService)).toBeInstanceOf(
      ServiceFormsService,
    );
  });

  const createHarness = (
    configuration: ServiceFormsConfiguration = defaultServiceFormsConfiguration,
  ) => {
    const memory = createInMemoryServiceCatalogPrisma();
    Object.assign(memory.prisma, {
      $queryRaw: async (
        _query: TemplateStringsArray,
        ..._values: unknown[]
      ) => [],
      $executeRaw: async (
        _query: TemplateStringsArray,
        ..._values: unknown[]
      ) => 0,
    });
    const catalog = new ServiceCatalogService(
      memory.prisma as never,
      {
        load: async () => defaultServiceLifecycleConfiguration,
      } as never,
    );
    const forms = new ServiceFormsService(
      memory.prisma as never,
      {
        load: async () => configuration,
      } as never,
    );
    return { catalog, forms, memory };
  };

  const createDraftService = async (catalog: ServiceCatalogService) => {
    const category = await catalog.createCategory({ name: "IT", slug: "it" });
    return catalog.create({
      name: "VPN access",
      slug: "vpn-access",
      categoryId: category.id,
    });
  };

  it("creates a form as version 1 without hardcoded service fields", async () => {
    const { catalog, forms } = createHarness();
    const service = await createDraftService(catalog);
    const created = await forms.createForm(service.id, { schema: validSchema });
    expect(created.version).toBe(1);
    expect(created.status).toBe("DRAFT");
    expect(created.isImmutable).toBe(false);
    expect(created.schema).toEqual(validSchema);
    expect(created.formVersionRef).toBe(created.formVersionRef);
    const duplicateError = await forms
      .createForm(service.id, { schema: validSchema })
      .catch((error: unknown) => error);
    expect(duplicateError).toBeInstanceOf(ConflictException);
    const duplicateConflict = duplicateError as ConflictException;
    expect(duplicateConflict.getStatus()).toBe(409);
    expect(duplicateConflict.getResponse()).toMatchObject({
      code: "FORM_ALREADY_EXISTS",
    });
  });

  it("records caller-supplied reasons for each human form mutation", async () => {
    const { catalog, forms, memory } = createHarness();
    const service = await createDraftService(catalog);
    const context = { actorUserId: "admin-1" };
    const created = await forms.createForm(
      service.id,
      { schema: validSchema, reason: "  Create the intake form  " },
      context,
    );
    const next = await forms.createFormVersion(
      service.id,
      { schema: nextSchema, reason: "  Add serial number collection  " },
      context,
    );
    await forms.updateFormVersion(
      service.id,
      next.formVersionRef,
      { schema: validSchema, reason: "  Match the approved intake fields  " },
      context,
    );
    await forms.activateFormVersion(
      service.id,
      next.formVersionRef,
      context,
      "  Approved for production  ",
    );

    expect(memory.changeLogs.slice(-4).map((entry) => entry.reason)).toEqual([
      "Create the intake form",
      "Add serial number collection",
      "Match the approved intake fields",
      "Approved for production",
    ]);
    expect(
      memory.changeLogs
        .slice(-4)
        .map((entry) => (entry.diff as { action?: string }).action),
    ).toEqual([
      "service_form.create",
      "service_form.version_create",
      "service_form.version_update",
      "service_form.version_activate",
    ]);
    expect(
      memory.changeLogs
        .slice(-4)
        .every((entry) => entry.actorUserId === "admin-1"),
    ).toBe(true);

    const missingReason = await forms
      .createForm(service.id, { schema: validSchema }, context)
      .catch((error: unknown) => error);
    expect(missingReason).toMatchObject({
      response: { code: "REASON_REQUIRED" },
    });
    expect(created.version).toBe(1);
  });

  it("maps a version-1 unique conflict to the stable 409 contract", async () => {
    const { catalog, forms, memory } = createHarness();
    const service = await createDraftService(catalog);
    const delegate = memory.prisma.formVersion as unknown as {
      create: (input: unknown) => Promise<unknown>;
    };
    delegate.create = async () => {
      throw Object.assign(new Error("unique constraint violation"), {
        code: "P2002",
        meta: { target: ["serviceId", "version"] },
      });
    };

    const creationError = await forms
      .createForm(service.id, { schema: validSchema })
      .catch((error: unknown) => error);

    expect(creationError).toBeInstanceOf(ConflictException);
    const conflict = creationError as ConflictException;
    expect(conflict.getStatus()).toBe(409);
    expect(conflict.getResponse()).toMatchObject({
      code: "FORM_ALREADY_EXISTS",
    });
  });

  it("creates a new form version without mutating the previous one", async () => {
    const { catalog, forms } = createHarness();
    const service = await createDraftService(catalog);
    const first = await forms.createForm(service.id, { schema: validSchema });
    const second = await forms.createFormVersion(service.id, {
      schema: nextSchema,
    });
    expect(second.version).toBe(2);
    expect(second.formVersionRef).not.toBe(first.formVersionRef);
    const original = await forms.getFormVersion(
      service.id,
      first.formVersionRef,
    );
    expect(original.schema).toEqual(validSchema);
    expect(original.version).toBe(1);
  });

  it("retries a service/version unique conflict after reading the fresh version", async () => {
    const { catalog, forms, memory } = createHarness();
    const service = await createDraftService(catalog);
    await forms.createForm(service.id, { schema: validSchema });
    const transaction = jest.spyOn(memory.prisma, "$transaction");
    const delegate = memory.prisma.formVersion as unknown as {
      create: (input: unknown) => Promise<unknown>;
    };
    const originalCreate = delegate.create.bind(delegate);
    let attempts = 0;
    delegate.create = async (input: unknown) => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("unique constraint violation"), {
          code: "P2002",
          meta: { target: ["serviceId", "version"] },
        });
      }
      return originalCreate(input as never);
    };

    const created = await forms.createFormVersion(service.id, {
      schema: nextSchema,
    });

    expect(attempts).toBe(2);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(created.version).toBe(2);
  });

  it("maps repeated version allocation conflicts to a stable HTTP 409", async () => {
    const { catalog, forms, memory } = createHarness();
    const service = await createDraftService(catalog);
    await forms.createForm(service.id, { schema: validSchema });
    const transaction = jest.spyOn(memory.prisma, "$transaction");
    const delegate = memory.prisma.formVersion as unknown as {
      create: (input: unknown) => Promise<unknown>;
    };
    let attempts = 0;
    delegate.create = async () => {
      attempts += 1;
      throw Object.assign(new Error("unique constraint violation"), {
        code: "P2002",
        meta: { target: ["serviceId", "version"] },
      });
    };

    const allocationError = await forms
      .createFormVersion(service.id, { schema: nextSchema })
      .catch((error: unknown) => error);

    expect(attempts).toBe(3);
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(allocationError).toBeInstanceOf(ConflictException);
    const conflict = allocationError as ConflictException;
    expect(conflict.getStatus()).toBe(409);
    expect(conflict.getResponse()).toMatchObject({
      code: "FORM_VERSION_CREATE_CONFLICT",
    });
  });

  it("updates an unused draft schema without changing its version identity", async () => {
    const { catalog, forms, memory } = createHarness();
    const service = await createDraftService(catalog);
    const original = await forms.createForm(service.id, {
      schema: validSchema,
    });
    // This harness cannot model row locks; PostgreSQL integration tests cover them.
    Object.assign(memory.prisma, { $queryRaw: async () => [] });

    const updated = await forms.updateFormVersion(
      service.id,
      original.formVersionRef,
      { schema: nextSchema },
    );

    expect(updated).toMatchObject({
      formVersionRef: original.formVersionRef,
      serviceId: service.id,
      version: original.version,
      status: "DRAFT",
      schema: nextSchema,
      isImmutable: false,
    });
  });

  it("pages bounded form history and keeps the active schema independently available", async () => {
    const { catalog, forms } = createHarness();
    const service = await createDraftService(catalog);
    const active = await forms.createForm(service.id, { schema: validSchema });
    await forms.activateFormVersion(service.id, active.formVersionRef);
    for (let version = 2; version <= 5; version += 1) {
      await forms.createFormVersion(service.id, { schema: nextSchema });
    }

    const first = await forms.getForm(service.id, undefined, { take: 2 });
    expect(first).toMatchObject({
      total: 5,
      take: 2,
      hasMore: true,
      activeFormVersionRef: active.formVersionRef,
    });
    expect(first.versions.map((item) => item.version)).toEqual([5, 4]);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await forms.getForm(service.id, undefined, {
      take: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.versions.map((item) => item.version)).toEqual([3, 2]);
    expect(second.hasMore).toBe(true);

    const final = await forms.getForm(service.id, undefined, {
      take: 2,
      cursor: second.nextCursor ?? undefined,
    });
    expect(final.versions.map((item) => item.version)).toEqual([1]);
    expect(final.hasMore).toBe(false);
    await expect(forms.getActiveForm(service.id)).resolves.toMatchObject({
      activeForm: {
        formVersionRef: active.formVersionRef,
        schema: validSchema,
      },
    });
  });

  it("keeps exactly one active version when multiple active forms are disabled", async () => {
    const { catalog, forms } = createHarness();
    const service = await createDraftService(catalog);
    const first = await forms.createForm(service.id, { schema: validSchema });
    const second = await forms.createFormVersion(service.id, {
      schema: nextSchema,
    });

    await forms.activateFormVersion(service.id, first.formVersionRef);
    await forms.activateFormVersion(service.id, second.formVersionRef);

    const history = await forms.getForm(service.id);
    expect(
      history.versions.map(({ formVersionRef, status }) => [
        formVersionRef,
        status,
      ]),
    ).toEqual([
      [second.formVersionRef, "ACTIVE"],
      [first.formVersionRef, "RETIRED"],
    ]);
  });

  it("preserves multiple active versions when the setting allows them", async () => {
    const { catalog, forms } = createHarness({
      ...defaultServiceFormsConfiguration,
      allowMultipleActiveVersions: true,
    });
    const service = await createDraftService(catalog);
    const first = await forms.createForm(service.id, { schema: validSchema });
    const second = await forms.createFormVersion(service.id, {
      schema: nextSchema,
    });

    await forms.activateFormVersion(service.id, first.formVersionRef);
    await forms.activateFormVersion(service.id, second.formVersionRef);

    const history = await forms.getForm(service.id);
    expect(history.versions.map(({ status }) => status)).toEqual([
      "ACTIVE",
      "ACTIVE",
    ]);
  });

  it("makes a version immutable after tickets reference it", async () => {
    const { catalog, forms, memory } = createHarness();
    const service = await createDraftService(catalog);
    const first = await forms.createForm(service.id, { schema: validSchema });
    memory.seedTicket({
      id: "ticket-bound-form",
      ticketNumber: "T-1",
      serviceId: service.id,
      formVersionId: first.formVersionRef,
      status: "PENDING",
      formData: { asset_tag: "LPT-1" },
    });
    await expect(
      forms.updateFormVersion(service.id, first.formVersionRef, {
        schema: nextSchema,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const locked = await forms.getFormVersion(service.id, first.formVersionRef);
    expect(locked.isImmutable).toBe(true);
    expect(locked.schema).toEqual(validSchema);
  });

  it("exposes form enablement and ticket version requirement to API clients", async () => {
    const { catalog, forms } = createHarness({
      ...defaultServiceFormsConfiguration,
      enabled: false,
      requireVersionOnTicket: false,
    });
    const service = await createDraftService(catalog);

    await expect(forms.getForm(service.id)).resolves.toMatchObject({
      serviceId: service.id,
      formsEnabled: false,
      requireVersionOnTicket: false,
    });
  });

  it("exposes optional form-version policy while forms remain enabled", async () => {
    const { catalog, forms } = createHarness({
      ...defaultServiceFormsConfiguration,
      requireVersionOnTicket: false,
    });
    const service = await createDraftService(catalog);

    await expect(forms.getForm(service.id)).resolves.toMatchObject({
      serviceId: service.id,
      formsEnabled: true,
      requireVersionOnTicket: false,
    });
  });

  it("rejects invalid schemas through create", async () => {
    const { catalog, forms } = createHarness();
    const service = await createDraftService(catalog);
    await expect(
      forms.createForm(service.id, { schema: { schemaVersion: 1 } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects unsafe patterns and blocks legacy unsafe-draft activation", async () => {
    const { catalog, forms, memory } = createHarness();
    const service = await createDraftService(catalog);
    const unsafeSchema = {
      schemaVersion: 1,
      fields: [
        {
          id: "payload",
          label: "Payload",
          type: "text",
          required: true,
          order: 0,
          validation: { pattern: "^(a+)+$" },
        },
      ],
    };
    await expect(
      forms.createForm(service.id, { schema: unsafeSchema }),
    ).rejects.toMatchObject({
      response: { code: "UNSAFE_FORM_PATTERN" },
    });

    const draft = await forms.createForm(service.id, { schema: validSchema });
    memory.seedFormVersion({
      id: draft.formVersionRef,
      serviceId: draft.serviceId,
      version: draft.version,
      schema: unsafeSchema,
      status: draft.status,
      createdAt: new Date(draft.createdAt),
      updatedAt: new Date(draft.updatedAt),
    });
    await expect(
      forms.activateFormVersion(service.id, draft.formVersionRef),
    ).rejects.toMatchObject({
      response: { code: "UNSAFE_FORM_PATTERN" },
    });
    await expect(
      forms.getFormVersion(service.id, draft.formVersionRef),
    ).resolves.toMatchObject({
      status: "DRAFT",
    });
  });
});

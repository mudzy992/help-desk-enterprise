import type { Prisma } from "../../generated/prisma/client";
import { defaultServiceLifecycleConfiguration } from "../service-catalog/service-catalog.constants";
import { createConfigSnapshotFixture } from "./create-config-snapshot-fixture";
import type {
  ConfigFormVersionSnapshot,
  ConfigServiceSnapshot,
  ConfigSnapshot,
} from "./config-versioning.types";
import { applyCatalogSnapshot } from "./apply-catalog-snapshot";
import { computeCatalogStateHash } from "./catalog-state-hash";
import { configVersioningErrorCodes } from "./config-versioning.constants";
import {
  toFormVersionSnapshot,
  toServiceSnapshot,
} from "./serialize-config-snapshot";

const originalSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: "summary",
      label: "Summary",
      type: "text",
      required: true,
      order: 0,
    },
  ],
};
const changedSchema = {
  schemaVersion: 1,
  fields: [
    ...originalSchema.fields,
    {
      id: "asset_tag",
      label: "Asset tag",
      type: "text",
      required: false,
      order: 1,
    },
  ],
};

type ServiceRow = ConfigServiceSnapshot & {
  createdAt: Date;
  updatedAt: Date;
};

type FormRow = ConfigFormVersionSnapshot & {
  createdAt: Date;
  updatedAt: Date;
};

type MutableState = {
  services: ServiceRow[];
  forms: FormRow[];
};

type FakeTransaction = {
  readonly transaction: Prisma.TransactionClient;
  readonly state: MutableState;
};

function serviceRow(overrides: Partial<ServiceRow> = {}): ServiceRow {
  return {
    id: "service-vpn",
    name: "VPN",
    slug: "vpn",
    categoryId: "category-1",
    lifecycle: "ACTIVE",
    availability: "OPERATIONAL",
    classification: "INTERNAL",
    requiresApproval: false,
    isConfidentialDefault: false,
    autoAssignStrategy: "NONE",
    slaProfileId: null,
    policyPackId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function formRow(overrides: Partial<FormRow> = {}): FormRow {
  return {
    id: "form-1",
    serviceId: "service-vpn",
    version: 1,
    status: "ACTIVE",
    schema: originalSchema,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createSnapshot(
  state: MutableState,
  overrides: {
    readonly services?: readonly ConfigServiceSnapshot[];
    readonly forms?: readonly ConfigFormVersionSnapshot[];
    readonly includeHash?: boolean;
  } = {},
): ConfigSnapshot {
  const base = createConfigSnapshotFixture();
  const snapshot: ConfigSnapshot = {
    ...base,
    catalog: {
      services:
        overrides.services ??
        state.services.map((service) => toServiceSnapshot(service)),
    },
    forms: {
      versions:
        overrides.forms ??
        state.forms.map((form) => toFormVersionSnapshot(form)),
    },
    ...(overrides.includeHash === false
      ? {}
      : {
          catalogStateHash: computeCatalogStateHash(
            state.services,
            state.forms,
          ),
        }),
  };
  return snapshot;
}

function createFakeTransaction(
  initial: MutableState,
  ticketCounts: ReadonlyMap<string, number> = new Map(),
): FakeTransaction {
  const state: MutableState = {
    services: initial.services.map((service) => ({ ...service })),
    forms: initial.forms.map((form) => ({ ...form })),
  };
  let nextFormId = 1;
  const transaction = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([]),
    service: {
      findMany: jest.fn(async () =>
        state.services.map((service) => ({ ...service })),
      ),
      update: jest.fn(
        async (input: {
          readonly where: { readonly id: string };
          readonly data: Partial<ServiceRow>;
        }) => {
          const service = state.services.find(
            (item) => item.id === input.where.id,
          );
          if (service === undefined) throw new Error("service fixture missing");
          Object.assign(service, input.data, { updatedAt: new Date() });
          return { ...service };
        },
      ),
    },
    formVersion: {
      findMany: jest.fn(async () => state.forms.map((form) => ({ ...form }))),
      update: jest.fn(
        async (input: {
          readonly where: { readonly id: string };
          readonly data: {
            readonly schema?: unknown;
            readonly status?: string;
          };
        }) => {
          const form = state.forms.find((item) => item.id === input.where.id);
          if (form === undefined) throw new Error("form fixture missing");
          Object.assign(form, input.data, { updatedAt: new Date() });
          return { ...form };
        },
      ),
      updateMany: jest.fn(
        async (input: {
          readonly where: {
            readonly serviceId: string;
            readonly status: string;
            readonly id: { readonly not: string };
          };
          readonly data: { readonly status: string };
        }) => {
          let count = 0;
          for (const form of state.forms) {
            if (
              form.serviceId === input.where.serviceId &&
              form.status === input.where.status &&
              form.id !== input.where.id.not
            ) {
              Object.assign(form, {
                status: input.data.status,
                updatedAt: new Date(),
              });
              count += 1;
            }
          }
          return { count };
        },
      ),
      create: jest.fn(
        async (input: {
          readonly data: {
            readonly serviceId: string;
            readonly version: number;
            readonly schema: unknown;
            readonly status: string;
          };
        }) => {
          const form: FormRow = {
            id: `created-form-${nextFormId++}`,
            serviceId: input.data.serviceId,
            version: input.data.version,
            schema: input.data.schema as ConfigFormVersionSnapshot["schema"],
            status: input.data.status,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          state.forms.push(form);
          return { ...form };
        },
      ),
    },
    ticket: {
      groupBy: jest.fn(async () =>
        [...ticketCounts].map(([formVersionId, count]) => ({
          formVersionId,
          _count: { _all: count },
        })),
      ),
    },
    serviceCategory: {
      findMany: jest.fn(
        async (input: {
          readonly where: { readonly id: { readonly in: readonly string[] } };
        }) =>
          input.where.id.in
            .filter((id) => id === "category-1")
            .map((id) => ({ id })),
      ),
    },
    slaProfile: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    policyPack: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return {
    transaction: transaction as unknown as Prisma.TransactionClient,
    state,
  };
}

describe("applyCatalogSnapshot", () => {
  it("creates a new ACTIVE version rather than rewriting an immutable historical schema", async () => {
    const initial: MutableState = {
      services: [serviceRow()],
      forms: [formRow()],
    };
    const snapshot = createSnapshot(initial, {
      forms: [
        {
          ...toFormVersionSnapshot(initial.forms[0]!),
          schema: changedSchema,
        },
      ],
    });
    const fake = createFakeTransaction(initial);

    const applied = await applyCatalogSnapshot(
      fake.transaction,
      snapshot,
      defaultServiceLifecycleConfiguration,
    );

    expect(fake.state.forms).toHaveLength(2);
    expect(fake.state.forms[0]).toMatchObject({
      id: "form-1",
      version: 1,
      status: "RETIRED",
      schema: originalSchema,
    });
    expect(fake.state.forms[1]).toMatchObject({
      version: 2,
      status: "ACTIVE",
      schema: changedSchema,
    });
    expect(
      fake.state.forms.filter((form) => form.status === "ACTIVE"),
    ).toHaveLength(1);
    expect(applied.forms.versions).toHaveLength(2);
    expect(applied.catalogStateHash).toBe(
      computeCatalogStateHash(fake.state.services, fake.state.forms),
    );
  });

  it("preserves a ticket-bound DRAFT row and materializes changed schema as a new version", async () => {
    const initial: MutableState = {
      services: [serviceRow({ lifecycle: "DRAFT" })],
      forms: [formRow({ status: "DRAFT" })],
    };
    const snapshot = createSnapshot(initial, {
      forms: [
        {
          ...toFormVersionSnapshot(initial.forms[0]!),
          schema: changedSchema,
        },
      ],
    });
    const fake = createFakeTransaction(initial, new Map([["form-1", 1]]));

    await applyCatalogSnapshot(
      fake.transaction,
      snapshot,
      defaultServiceLifecycleConfiguration,
    );

    expect(fake.state.forms).toHaveLength(2);
    expect(fake.state.forms[0]).toMatchObject({
      id: "form-1",
      version: 1,
      status: "DRAFT",
      schema: originalSchema,
    });
    expect(fake.state.forms[1]).toMatchObject({
      version: 2,
      status: "DRAFT",
      schema: changedSchema,
    });
  });

  it("preserves unchanged legacy patterns on retired versions without evaluating them", async () => {
    const legacyUnsafeSchema = {
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
    const initial: MutableState = {
      services: [serviceRow()],
      forms: [
        formRow({ status: "RETIRED", schema: legacyUnsafeSchema }),
        formRow({ id: "form-2", version: 2, schema: originalSchema }),
      ],
    };
    const fake = createFakeTransaction(initial);

    await expect(
      applyCatalogSnapshot(
        fake.transaction,
        createSnapshot(initial),
        defaultServiceLifecycleConfiguration,
      ),
    ).resolves.toMatchObject({
      forms: {
        versions: expect.arrayContaining([
          expect.objectContaining({ id: "form-1", status: "RETIRED" }),
        ]),
      },
    });
    expect(fake.state.forms[0]!.schema).toEqual(legacyUnsafeSchema);
    expect(fake.state.forms[0]!.status).toBe("RETIRED");
  });

  it("rejects an unsafe legacy pattern if a config snapshot tries to activate it", async () => {
    const legacyUnsafeSchema = {
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
    const initial: MutableState = {
      services: [serviceRow()],
      forms: [formRow({ status: "DRAFT", schema: legacyUnsafeSchema })],
    };
    const fake = createFakeTransaction(initial);
    const snapshot = createSnapshot(initial, {
      forms: [
        {
          ...toFormVersionSnapshot(initial.forms[0]!),
          status: "ACTIVE",
        },
      ],
    });

    await expect(
      applyCatalogSnapshot(
        fake.transaction,
        snapshot,
        defaultServiceLifecycleConfiguration,
      ),
    ).rejects.toMatchObject({
      code: configVersioningErrorCodes.catalogInvariantViolation,
    });
    expect(fake.state.forms[0]!.status).toBe("DRAFT");
  });

  it("rejects a stale expected catalog hash before making writes", async () => {
    const initial: MutableState = {
      services: [serviceRow()],
      forms: [formRow()],
    };
    const snapshot = createSnapshot(initial);
    const fake = createFakeTransaction(initial);
    Object.assign(fake.state.services[0]!, {
      updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    await expect(
      applyCatalogSnapshot(
        fake.transaction,
        snapshot,
        defaultServiceLifecycleConfiguration,
      ),
    ).rejects.toMatchObject({
      code: configVersioningErrorCodes.catalogStateConflict,
    });
    expect(fake.state.forms).toHaveLength(1);
  });

  it("rejects incomplete service/form identity sets instead of silently skipping IDs", async () => {
    const initial: MutableState = {
      services: [serviceRow()],
      forms: [formRow()],
    };
    const fake = createFakeTransaction(initial);
    const incomplete = createSnapshot(initial, { services: [], forms: [] });

    await expect(
      applyCatalogSnapshot(
        fake.transaction,
        incomplete,
        defaultServiceLifecycleConfiguration,
      ),
    ).rejects.toMatchObject({
      code: configVersioningErrorCodes.catalogStateConflict,
    });
    expect(fake.transaction.service.update).not.toHaveBeenCalled();
    expect(fake.transaction.formVersion.update).not.toHaveBeenCalled();
  });

  it("rejects missing category references before mutating catalog rows", async () => {
    const initial: MutableState = {
      services: [serviceRow()],
      forms: [formRow()],
    };
    const fake = createFakeTransaction(initial);
    const snapshot = createSnapshot(initial, {
      services: [
        { ...toServiceSnapshot(initial.services[0]!), categoryId: "missing" },
      ],
    });

    await expect(
      applyCatalogSnapshot(
        fake.transaction,
        snapshot,
        defaultServiceLifecycleConfiguration,
      ),
    ).rejects.toMatchObject({
      code: configVersioningErrorCodes.catalogInvariantViolation,
    });
    expect(fake.state.services[0]!.categoryId).toBe("category-1");
    expect(fake.transaction.service.update).not.toHaveBeenCalled();
  });

  it("rejects slug changes and illegal service lifecycle transitions before mutation", async () => {
    const initial: MutableState = {
      services: [serviceRow()],
      forms: [formRow()],
    };
    const slugFake = createFakeTransaction(initial);
    const slugSnapshot = createSnapshot(initial, {
      services: [
        { ...toServiceSnapshot(initial.services[0]!), slug: "vpn-new" },
      ],
    });
    await expect(
      applyCatalogSnapshot(
        slugFake.transaction,
        slugSnapshot,
        defaultServiceLifecycleConfiguration,
      ),
    ).rejects.toMatchObject({
      code: configVersioningErrorCodes.catalogInvariantViolation,
    });
    expect(slugFake.state.services[0]!.slug).toBe("vpn");

    const lifecycleFake = createFakeTransaction(initial);
    const lifecycleSnapshot = createSnapshot(initial, {
      services: [
        { ...toServiceSnapshot(initial.services[0]!), lifecycle: "DRAFT" },
      ],
    });
    await expect(
      applyCatalogSnapshot(
        lifecycleFake.transaction,
        lifecycleSnapshot,
        defaultServiceLifecycleConfiguration,
      ),
    ).rejects.toMatchObject({
      code: configVersioningErrorCodes.catalogInvariantViolation,
    });
    expect(lifecycleFake.state.services[0]!.lifecycle).toBe("ACTIVE");
  });

  it("allows a legacy snapshot only as a catalog no-op and materializes its fresh hash", async () => {
    const initial: MutableState = {
      services: [serviceRow()],
      forms: [formRow()],
    };
    const fake = createFakeTransaction(initial);
    const legacySnapshot = createSnapshot(initial, { includeHash: false });

    const applied = await applyCatalogSnapshot(
      fake.transaction,
      legacySnapshot,
      defaultServiceLifecycleConfiguration,
    );

    expect(applied.catalogStateHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(fake.state.forms).toHaveLength(1);
  });
});

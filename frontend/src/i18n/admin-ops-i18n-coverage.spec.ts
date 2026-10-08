import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import bs from "@/i18n/locales/bs/common.json";
import en from "@/i18n/locales/en/common.json";
import {
  knownAuditActions,
  knownAuditEntityTypes,
  knownAuditMetadataFields,
  auditActionTranslationKey,
  auditEntityTranslationKey,
  auditMetadataFieldTranslationKey,
  flattenAuditMetadata,
} from "@/lib/audit/audit-log-i18n";
import {
  knownScheduledJobIds,
  scheduledJobTranslationKey,
} from "@/lib/ops/scheduled-job-i18n";
import {
  integrationJobAdminStatuses,
  integrationJobStatuses,
  integrationJobTypes,
} from "@/services/integration-queue-types";

type Dictionary = Record<string, unknown>;
const modulesRoot = resolve(__dirname, "../../../backend/src/modules");
const auditConstantsPath = resolve(modulesRoot, "audit-log/audit-log.constants.ts");
const prismaEnumsPath = resolve(__dirname, "../../../backend/prisma/schema/enums.prisma");

function readAuditEnum(name: "auditLogActions" | "auditLogEntityTypes"): readonly string[] {
  const source = readFileSync(auditConstantsPath, "utf8");
  const match = new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\n\\} as const;`).exec(source);
  if (match === null) throw new Error(`Cannot find backend ${name}`);
  return [...match[1].matchAll(/^\s*\w+:\s*'([^']+)'/gm)].map((entry) => entry[1] ?? "");
}

function readPrismaEnum(name: "IntegrationJobStatus" | "IntegrationJobType"): readonly string[] {
  const source = readFileSync(prismaEnumsPath, "utf8");
  const match = new RegExp(`enum ${name} \\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (match === null) throw new Error(`Cannot find Prisma enum ${name}`);
  return match[1]
    .replace(/\/\/.*$/gm, "")
    .split(/\s+/)
    .filter((value) => /^[A-Z][A-Z0-9_]*$/.test(value));
}

function listTypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? listTypeScriptFiles(path)
      : entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")
        ? [path]
        : [];
  });
}

function readSchedulerIds(): readonly string[] {
  const values = listTypeScriptFiles(modulesRoot).flatMap((path) =>
    [...readFileSync(path, "utf8").matchAll(/export const \w*SchedulerId\s*=\s*['"]([^'"]+)['"]/g)].map(
      (match) => match[1] ?? "",
    ),
  );
  return [...new Set(values)].sort();
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function lookup(tree: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>(
    (node, part) => (node as Dictionary | undefined)?.[part],
    tree,
  );
}

const localeRows = [
  ["bs", bs],
  ["en", en],
] as const;

function assertTranslatedCatalogue(
  locale: unknown,
  path: readonly string[],
  values: readonly string[],
  displayKey: (value: string) => string,
) {
  const labels = lookup(locale, path) as Dictionary;
  const expectedKeys = values.map(displayKey).sort();
  expect(Object.keys(labels).sort()).toEqual(expectedKeys);
  for (const key of expectedKeys) {
    const label = labels[key];
    expect(typeof label, key).toBe("string");
    expect((label as string).trim().length, key).toBeGreaterThan(0);
  }
}

describe("Admin jobs and audit localization (5.3.5)", () => {
  it("keeps the audit action and entity catalog aligned with the backend", () => {
    expect([...knownAuditActions].sort()).toEqual([...readAuditEnum("auditLogActions")].sort());
    expect([...knownAuditEntityTypes].sort()).toEqual(
      [...readAuditEnum("auditLogEntityTypes")].sort(),
    );
    expect(new Set(knownAuditActions.map(slug)).size).toBe(knownAuditActions.length);
    expect(new Set(knownAuditEntityTypes.map(slug)).size).toBe(knownAuditEntityTypes.length);
  });

  it.each(localeRows)("%s translates every audit action and entity", (_locale, dictionary) => {
    assertTranslatedCatalogue(dictionary, ["admin", "ops", "auditLog", "labels", "actions"], knownAuditActions, slug);
    assertTranslatedCatalogue(dictionary, ["admin", "ops", "auditLog", "labels", "entities"], knownAuditEntityTypes, slug);
  });

  it.each(localeRows)("%s translates every known audit metadata field", (_locale, dictionary) => {
    assertTranslatedCatalogue(
      dictionary,
      ["admin", "ops", "auditLog", "labels", "fields"],
      knownAuditMetadataFields,
      (field) => field,
    );
  });

  it("covers every registered scheduler id with a human-readable name", () => {
    const schedulerIds = readSchedulerIds();
    expect([...knownScheduledJobIds].sort()).toEqual(schedulerIds);
    const translatedKeys = new Set(knownScheduledJobIds.map(slug));
    for (const [_locale, dictionary] of localeRows) {
      const labels = lookup(dictionary, ["admin", "opsHealth", "schedulers", "names"]) as Dictionary;
      expect(Object.keys(labels).sort()).toEqual([...translatedKeys].sort());
      for (const id of knownScheduledJobIds) {
        expect(typeof labels[slug(id)], id).toBe("string");
        expect((labels[slug(id)] as string).trim().length, id).toBeGreaterThan(0);
      }
    }
  });

  it("keeps integration queue type and status translations aligned with Prisma enums", () => {
    const expectedStatuses = readPrismaEnum("IntegrationJobStatus");
    const expectedTypes = readPrismaEnum("IntegrationJobType");
    expect([...integrationJobAdminStatuses].sort()).toEqual([...expectedStatuses].sort());
    expect(Object.values(integrationJobStatuses).sort()).toEqual([...expectedStatuses].sort());
    expect([...integrationJobTypes].sort()).toEqual([...expectedTypes].sort());
    for (const [_locale, dictionary] of localeRows) {
      const statuses = lookup(dictionary, ["integrationQueue", "statuses"]) as Dictionary;
      const types = lookup(dictionary, ["integrationQueue", "types"]) as Dictionary;
      expect(Object.keys(statuses).sort()).toEqual([...expectedStatuses].sort());
      expect(Object.keys(types).sort()).toEqual([...expectedTypes].sort());
      for (const value of [...expectedStatuses, ...expectedTypes]) {
        expect(typeof (statuses[value] ?? types[value]), value).toBe("string");
        const label = statuses[value] ?? types[value];
        expect((label as string).trim().length, value).toBeGreaterThan(0);
      }
      expect((lookup(dictionary, ["integrationQueue", "loadMore"]) as string).trim()).not.toBe("");
      expect((lookup(dictionary, ["integrationQueue", "loadingMore"]) as string).trim()).not.toBe("");
    }
  });

  it("uses safe generic labels for values introduced by an unknown backend", () => {
    expect(auditActionTranslationKey("future.action")).toBeNull();
    expect(auditEntityTranslationKey("future_entity")).toBeNull();
    expect(auditMetadataFieldTranslationKey("futureField")).toBeNull();
    expect(flattenAuditMetadata({ reason: "planned work", futureField: "value" })).toEqual([
      { path: ["reason"], value: "planned work" },
      { path: ["futureField"], value: "value" },
    ]);
  });

  it("resolves known scheduler names from ids or BullMQ key components", () => {
    expect(scheduledJobTranslationKey("sla-scan-every-minute")).toBe(
      "admin.opsHealth.schedulers.names.sla_scan_every_minute",
    );
    expect(
      scheduledJobTranslationKey("repeat:integration-worker-heartbeat-every:abc123"),
    ).toBe("admin.opsHealth.schedulers.names.integration_worker_heartbeat_every");
    expect(scheduledJobTranslationKey("unknown-scheduler")).toBeNull();
  });

});

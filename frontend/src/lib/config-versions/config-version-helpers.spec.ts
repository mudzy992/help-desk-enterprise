import { describe, expect, it } from "vitest";
import {
  canOpenConfigVersions,
  canWriteConfigVersions,
} from "@/lib/config-versions/can-access-config-versions";
import {
  canActivateConfigVersion,
  canRollbackConfigVersion,
  canValidateConfigVersion,
} from "@/lib/config-versions/config-version-actions";
import {
  filterConfigVersions,
  formatConfigDiffChange,
} from "@/lib/config-versions/config-version-display";
import { mapConfigVersionError } from "@/lib/config-versions/map-config-version-error";
import { requireConfigChangeReason } from "@/lib/config-versions/require-config-change-reason";
import { permissionKeys } from "@/lib/session/permission-keys";
import { ApiError } from "@/services/api";
import type { ConfigVersion } from "@/services/config-versions-types";

const version = (status: ConfigVersion["status"], id = status): ConfigVersion => ({
  id,
  version: 1,
  status,
  releaseNotes: null,
  createdByUserId: null,
  activatedAt: null,
  createdAt: "2026-09-14T10:00:00.000Z",
  updatedAt: "2026-09-14T10:00:00.000Z",
  rollbackOfVersion: null,
});

describe("config version helpers", () => {
  it("gates open/write access", () => {
    expect(canOpenConfigVersions({ isSuperAdmin: true, roleKeys: [] })).toBe(true);
    expect(canOpenConfigVersions({ isSuperAdmin: false, roleKeys: ["ADMIN"] })).toBe(true);
    expect(canOpenConfigVersions({ isSuperAdmin: false, roleKeys: ["AGENT"] })).toBe(false);
    expect(
      canWriteConfigVersions({
        isSuperAdmin: false,
        permissionKeys: [permissionKeys.settingsWrite],
      }),
    ).toBe(true);
    expect(canWriteConfigVersions({ isSuperAdmin: false, permissionKeys: [] })).toBe(false);
  });

  it("enables validate/activate/rollback by status", () => {
    expect(canValidateConfigVersion("DRAFT")).toBe(true);
    expect(canActivateConfigVersion("VALIDATED")).toBe(true);
    expect(canActivateConfigVersion("ACTIVE")).toBe(false);
    expect(canRollbackConfigVersion("ACTIVE")).toBe(true);
    expect(canRollbackConfigVersion("DRAFT")).toBe(false);
  });

  it("requires a non-empty reason under 512 characters", () => {
    expect(requireConfigChangeReason("  ")).toBeNull();
    expect(requireConfigChangeReason("rollback after failed SLA")).toBe(
      "rollback after failed SLA",
    );
    expect(requireConfigChangeReason("x".repeat(513))).toBeNull();
  });

  it("filters by status and formats diff rows", () => {
    const items = [version("DRAFT", "d"), version("ACTIVE", "a")];
    expect(filterConfigVersions(items, "ALL")).toHaveLength(2);
    expect(filterConfigVersions(items, "ACTIVE").map((item) => item.id)).toEqual(["a"]);
    expect(formatConfigDiffChange({ path: "sla.rules", before: 1, after: 2 })).toBe(
      "sla.rules: 1 → 2",
    );
  });

  it("maps backend error codes", () => {
    expect(mapConfigVersionError(new ApiError(503, "CONFIG_VERSIONING_DISABLED", "x"))).toBe(
      "configVersions.errorDisabled",
    );
    expect(mapConfigVersionError(new ApiError(400, "REASON_REQUIRED", "x"))).toBe(
      "configVersions.errorReason",
    );
    expect(mapConfigVersionError(new ApiError(400, "CONFIG_VALIDATION_FAILED", "x"))).toBe(
      "configVersions.errorValidation",
    );
  });
});

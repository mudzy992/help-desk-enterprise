import { describe, expect, it } from "vitest";
import { canRetryIntegrationJob } from "@/lib/queue/can-retry-integration-job";
import { canManageIntegrationQueue } from "@/lib/queue/can-manage-integration-queue";
import { mapIntegrationQueueError } from "@/lib/queue/map-integration-queue-error";
import { truncateQueueError } from "@/lib/queue/truncate-queue-error";
import { integrationJobBadgeTone } from "@/lib/queue/integration-job-badge-tone";
import { ApiError } from "@/services/api";
import { permissionKeys } from "@/lib/session/permission-keys";

describe("integration queue helpers", () => {
  it("allows retry only on FAILED and DLQ", () => {
    expect(canRetryIntegrationJob("PENDING")).toBe(false);
    expect(canRetryIntegrationJob("FAILED")).toBe(true);
    expect(canRetryIntegrationJob("DLQ")).toBe(true);
  });

  it("gates manage access to SuperAdmin or queue permission", () => {
    expect(
      canManageIntegrationQueue({ isSuperAdmin: true, permissionKeys: [] }),
    ).toBe(true);
    expect(
      canManageIntegrationQueue({
        isSuperAdmin: false,
        permissionKeys: [permissionKeys.integrationsQueueManage],
      }),
    ).toBe(true);
    expect(
      canManageIntegrationQueue({ isSuperAdmin: false, permissionKeys: [] }),
    ).toBe(false);
  });

  it("maps admin-disabled and invalid-status codes", () => {
    expect(mapIntegrationQueueError(new ApiError(403, "ADMIN_UI_DISABLED", "x"))).toBe(
      "integrationQueue.errorDisabled",
    );
    expect(mapIntegrationQueueError(new ApiError(400, "INVALID_STATUS", "x"))).toBe(
      "integrationQueue.errorInvalidStatus",
    );
    expect(mapIntegrationQueueError(new ApiError(401, "INVALID_CREDENTIALS", "x"))).toBe(
      "integrationQueue.errorUnauthorized",
    );
  });

  it("truncates lastError and maps status tones", () => {
    expect(truncateQueueError(null)).toBe("");
    expect(truncateQueueError("short")).toBe("short");
    expect(truncateQueueError("abcdefghij", 8)).toBe("abcdefgh…");
    expect(integrationJobBadgeTone("PENDING")).toBe("warning");
    expect(integrationJobBadgeTone("DLQ")).toBe("danger");
  });
});

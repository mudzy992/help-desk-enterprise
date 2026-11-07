import { describe, expect, it } from "vitest";
import { mapIntegrationJobErrorCode } from "@/lib/queue/map-integration-job-error-code";

describe("mapIntegrationJobErrorCode", () => {
  it("maps only stable error codes to localized labels", () => {
    expect(mapIntegrationJobErrorCode(null)).toBe("integrationQueue.noError");
    expect(mapIntegrationJobErrorCode("EDGE_EVENT_NO_SUBSCRIBERS")).toBe(
      "integrationQueue.errorCodes.EDGE_EVENT_NO_SUBSCRIBERS",
    );
    expect(mapIntegrationJobErrorCode("INTEGRATION_JOB_FAILED")).toBe(
      "integrationQueue.errorCodes.INTEGRATION_JOB_FAILED",
    );
  });

  it("uses the generic localized label for an unknown value", () => {
    expect(mapIntegrationJobErrorCode("SMTP private@example.test: secret response")).toBe(
      "integrationQueue.errorCodes.INTEGRATION_JOB_FAILED",
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/services/api";
import {
  createReportCommandKey,
  deleteReportSchedule,
  runReportScheduleNow,
  setReportScheduleEnabled,
  updateReportSchedule,
  type SaveReportScheduleInput,
} from "@/services/report-schedules-api";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

const input: SaveReportScheduleInput = {
  name: "Sedmični IT izvještaj",
  frequency: "WEEKLY",
  sendTime: "07:00",
  organizationalUnitId: "ou-it",
  sections: ["kpi"],
  packKeys: [],
  recipientUserIds: ["u-1"],
};

/**
 * W7.95 (`BA-reports-05`): all three admin writes carry the version the editor loaded, so the server can refuse a
 * save that would overwrite somebody else's change (412) instead of applying it.
 */
describe("report schedule conditional writes (BA-reports-05)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the loaded version as If-Match on update", () => {
    updateReportSchedule("sch-1", input, 7);

    expect(apiRequest).toHaveBeenCalledWith("/reports/schedules/sch-1", {
      method: "PUT",
      headers: { "If-Match": '"v7"' },
      body: JSON.stringify(input),
    });
  });

  it("sends the version on the enable toggle and on delete", () => {
    setReportScheduleEnabled("sch-1", false, 3);
    deleteReportSchedule("sch-1", 4);

    expect(apiRequest).toHaveBeenNthCalledWith(1, "/reports/schedules/sch-1/enabled", {
      method: "PATCH",
      headers: { "If-Match": '"v3"' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/reports/schedules/sch-1", {
      method: "DELETE",
      headers: { "If-Match": '"v4"' },
    });
  });

  it("encodes the id so a path surprise cannot drop the token", () => {
    deleteReportSchedule("sch/1", 2);

    expect(apiRequest).toHaveBeenCalledWith(
      "/reports/schedules/sch%2F1",
      expect.objectContaining({ headers: { "If-Match": '"v2"' } }),
    );
  });
});

/**
 * W7.106 (`BA-reports-16`): the command carries its identity in the header, and the fallback key keeps the shape the
 * server validates even where `crypto.randomUUID` is missing.
 */
describe("„send now” command idempotency (BA-reports-16)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the Idempotency-Key header", () => {
    runReportScheduleNow("sch-1", "run-now-12345678");

    expect(apiRequest).toHaveBeenCalledWith("/reports/schedules/sch-1/run-now", {
      method: "POST",
      headers: { "Idempotency-Key": "run-now-12345678" },
    });
  });

  it("mints keys that satisfy the server-side pattern", () => {
    const pattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
    for (let index = 0; index < 50; index += 1) {
      expect(createReportCommandKey()).toMatch(pattern);
    }
  });

  it("falls back when randomUUID is unavailable", () => {
    const original = globalThis.crypto;
    // Some embedded browsers and test environments have no `randomUUID`.
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      const key = createReportCommandKey();
      expect(key).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u);
      expect(key.startsWith("run-now-")).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });
});

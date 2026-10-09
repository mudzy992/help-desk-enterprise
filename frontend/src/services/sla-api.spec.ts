import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/services/api";
import { updateSlaCalendar } from "@/services/sla-api";

vi.mock("@/services/api", () => ({ apiRequest: vi.fn() }));

const request = vi.mocked(apiRequest);

describe("updateSlaCalendar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("omits the immutable calendar key from the PATCH body", async () => {
    await updateSlaCalendar("calendar-1", {
      key: "E2E_CAL",
      name: "Updated calendar",
      timezone: "Europe/Sarajevo",
      weeklyHours: { "1": [{ start: "08:00", end: "16:00" }] },
      holidays: [],
      isActive: true,
      reason: "Update from E2E",
    });

    expect(request).toHaveBeenCalledWith("/sla/calendars/calendar-1", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Updated calendar",
        timezone: "Europe/Sarajevo",
        weeklyHours: { "1": [{ start: "08:00", end: "16:00" }] },
        holidays: [],
        isActive: true,
        reason: "Update from E2E",
      }),
    });
  });
});

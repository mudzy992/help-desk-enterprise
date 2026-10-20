import { describe, expect, it } from "vitest";
import {
  isValidSendTime,
  previewNextReportRun,
  validateReportScheduleForm,
} from "./report-schedule-form";

describe("schedule form", () => {
  const valid = {
    name: "Sedmični IT",
    frequency: "WEEKLY" as const,
    sendTime: "07:00",
    organizationalUnitId: "ou-it",
    sections: ["kpi" as const],
    recipientUserIds: ["u1"],
  };

  it("accepts a valid form", () => {
    expect(validateReportScheduleForm(valid, 25)).toEqual([]);
  });

  it("reports every problem", () => {
    expect(
      validateReportScheduleForm(
        {
          ...valid,
          name: "  ",
          sendTime: "7:00",
          organizationalUnitId: "",
          sections: [],
          recipientUserIds: [],
        },
        25,
      ),
    ).toEqual(["name", "sendTime", "unit", "sections", "recipients"]);
    expect(validateReportScheduleForm({ ...valid, recipientUserIds: ["a", "b", "c"] }, 2)).toEqual([
      "recipientLimit",
    ]);
  });

  it("validates HH:mm", () => {
    expect(isValidSendTime("23:59")).toBe(true);
    expect(isValidSendTime("24:00")).toBe(false);
    expect(isValidSendTime("07:60")).toBe(false);
  });

  it("previews the next Monday / 1st in the configured zone", () => {
    expect(
      previewNextReportRun("WEEKLY", "07:00", "Europe/Sarajevo", new Date("2026-09-26T10:00:00Z")),
    ).toEqual(new Date("2026-09-28T05:00:00Z"));
    expect(
      previewNextReportRun("MONTHLY", "07:00", "Europe/Sarajevo", new Date("2026-09-30T22:00:00Z")),
    ).toEqual(new Date("2026-10-01T05:00:00Z"));
    expect(previewNextReportRun("MONTHLY", "bad", "Europe/Sarajevo", new Date())).toBeNull();
  });

  it("keeps the civil send hour through spring and fall DST boundaries", () => {
    const spring = previewNextReportRun(
      "WEEKLY",
      "07:00",
      "Europe/Sarajevo",
      new Date("2026-03-28T12:00:00Z"),
    );
    const fall = previewNextReportRun(
      "WEEKLY",
      "07:00",
      "Europe/Sarajevo",
      new Date("2026-10-24T12:00:00Z"),
    );
    expect(spring).toEqual(new Date("2026-03-30T05:00:00Z"));
    expect(fall).toEqual(new Date("2026-10-26T06:00:00Z"));
  });
});

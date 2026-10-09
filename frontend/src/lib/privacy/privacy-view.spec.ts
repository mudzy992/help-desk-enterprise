import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import {
  dateInputToIso,
  deadlineTone,
  formatBytes,
  isPseudonym,
  localizePersonName,
  matchesPersonQuery,
  needsIdentityCode,
  privacyNoticeState,
  privacyNoticeStateTone,
  readPrivacyErrorCode,
  readPrivacyTab,
  todayInputValue,
  visiblePrivacyTabs,
} from "./privacy-view";

const apiError = (code: string) => new ApiError(403, code, "x");

describe("privacy tabs", () => {
  it("hides anonymization, exports and the notice editor without the matching permission", () => {
    expect(visiblePrivacyTabs({ canManage: false, canAnonymize: false })).toEqual(["requests", "retention", "holds", "record"]);
    expect(visiblePrivacyTabs({ canManage: true, canAnonymize: false })).toEqual([
      "requests",
      "exports",
      "retention",
      "holds",
      "notice",
      "record",
    ]);
    expect(visiblePrivacyTabs({ canManage: true, canAnonymize: true })).toHaveLength(7);
  });

  it("falls back to the first visible tab for unknown or hidden values", () => {
    const viewer = { canManage: false, canAnonymize: false };
    expect(readPrivacyTab("exports", viewer)).toBe("requests");
    expect(readPrivacyTab("notice", viewer)).toBe("requests");
    expect(readPrivacyTab("nonsense", viewer)).toBe("requests");
    expect(readPrivacyTab(null, viewer)).toBe("requests");
    expect(readPrivacyTab("holds", viewer)).toBe("holds");
    expect(readPrivacyTab("notice", { canManage: true, canAnonymize: false })).toBe("notice");
  });
});

describe("deadlineTone", () => {
  it("maps the remaining days to the §11 colours", () => {
    expect(deadlineTone(null)).toBe("neutral");
    expect(deadlineTone(-1)).toBe("danger");
    expect(deadlineTone(0)).toBe("warning");
    expect(deadlineTone(7)).toBe("warning");
    expect(deadlineTone(8)).toBe("success");
  });
});

describe("pseudonyms", () => {
  it("translates the stored Bosnian pseudonym for English readers only", () => {
    expect(localizePersonName("Bivši korisnik #7F3A", "en")).toBe("Former user #7F3A");
    expect(localizePersonName("Bivši korisnik #7F3A9C", "en-GB")).toBe("Former user #7F3A9C");
    expect(localizePersonName("Bivši korisnik #7F3A", "bs")).toBe("Bivši korisnik #7F3A");
    expect(localizePersonName("Ana Anić", "en")).toBe("Ana Anić");
  });

  it("does not treat look-alike names as pseudonyms", () => {
    expect(isPseudonym("Bivši korisnik #7F3A")).toBe(true);
    expect(isPseudonym("Bivši korisnik #7f3a")).toBe(false);
    expect(isPseudonym("Bivši korisnik #7F3A extra")).toBe(false);
  });
});

describe("error codes", () => {
  it("reads known privacy codes and ignores the rest", () => {
    expect(readPrivacyErrorCode(apiError("LEGAL_HOLD_ACTIVE"))).toBe("LEGAL_HOLD_ACTIVE");
    expect(readPrivacyErrorCode(apiError("SOMETHING_ELSE"))).toBeNull();
    expect(readPrivacyErrorCode(new Error("x"))).toBeNull();
  });

  it("asks for an MFA code only on IDENTITY_CONFIRMATION_REQUIRED", () => {
    expect(needsIdentityCode(apiError("IDENTITY_CONFIRMATION_REQUIRED"))).toBe(true);
    expect(needsIdentityCode(apiError("IDENTITY_CONFIRMATION_FAILED"))).toBe(false);
  });
});

describe("formatting helpers", () => {
  it("formats byte sizes", () => {
    expect(formatBytes(null, "en")).toBe("—");
    expect(formatBytes(512, "en")).toBe("512 B");
    expect(formatBytes(1536, "en")).toBe("1.5 KB");
    expect(formatBytes(150 * 1024 * 1024, "en")).toBe("150 MB");
  });

  it("keeps the calendar day of a date input in any time zone", () => {
    const parsed = new Date(dateInputToIso("2026-03-29"));
    expect([parsed.getFullYear(), parsed.getMonth(), parsed.getDate()]).toEqual([2026, 2, 29]);
    expect(todayInputValue(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("never returns a future instant: today before noon is sent as now", () => {
    const morning = new Date(2026, 8, 29, 7, 15, 0);
    expect(dateInputToIso("2026-09-29", morning)).toBe(morning.toISOString());
    const afternoon = new Date(2026, 8, 29, 15, 0, 0);
    expect(dateInputToIso("2026-09-29", afternoon)).toBe(new Date(2026, 8, 29, 12, 0, 0).toISOString());
    expect(dateInputToIso("2026-09-20", morning)).toBe(new Date(2026, 8, 20, 12, 0, 0).toISOString());
  });

  it("matches people by name or e-mail, case-insensitively", () => {
    const person = { displayName: "Šefik Šehić", email: "sefik@example.ba" };
    expect(matchesPersonQuery(person, "")).toBe(true);
    expect(matchesPersonQuery(person, "šEH")).toBe(true);
    expect(matchesPersonQuery(person, "EXAMPLE")).toBe(true);
    expect(matchesPersonQuery(person, "ana")).toBe(false);
  });
});

describe("privacy notice state (5.3.7)", () => {
  it("is published only when the module is on and the language has its own text", () => {
    expect(privacyNoticeState(true, "Objavljeno.")).toBe("published");
    expect(privacyNoticeState(true, "   \n  ")).toBe("draft");
    expect(privacyNoticeState(true, "")).toBe("draft");
    expect(privacyNoticeState(false, "Objavljeno.")).toBe("disabled");
  });

  it("tones the badge green, yellow and red", () => {
    expect(privacyNoticeStateTone("published")).toBe("success");
    expect(privacyNoticeStateTone("draft")).toBe("warning");
    expect(privacyNoticeStateTone("disabled")).toBe("danger");
  });
});

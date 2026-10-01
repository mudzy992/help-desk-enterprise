import { describe, expect, it } from "vitest";
import { isResolveTicketsValid } from "@/components/problems/problem-resolve-tickets-section";
import type { ProblemResolvePreview } from "@/services/problems-api";

const preview = (overrides: Partial<ProblemResolvePreview> = {}): ProblemResolvePreview => ({
  max: 200,
  resolvable: 2,
  items: [],
  closeCodes: { enabled: false, required: false, codes: [] },
  ...overrides,
});

describe("isResolveTicketsValid", () => {
  it("is valid when the group resolution is off", () => {
    expect(isResolveTicketsValid({ enabled: false, message: "", closeCode: "" }, undefined)).toBe(true);
  });

  it("needs a loaded preview with resolvable tickets and a message", () => {
    const value = { enabled: true, message: "Riješeno.", closeCode: "" };
    expect(isResolveTicketsValid(value, undefined)).toBe(false);
    expect(isResolveTicketsValid(value, preview({ resolvable: 0 }))).toBe(false);
    expect(isResolveTicketsValid({ ...value, message: " ok " }, preview())).toBe(false);
    expect(isResolveTicketsValid(value, preview())).toBe(true);
  });

  it("needs a close code when the policy requires one", () => {
    const required = preview({ closeCodes: { enabled: true, required: true, codes: [{ key: "fixed", name: "Fixed" }] } });
    expect(isResolveTicketsValid({ enabled: true, message: "Riješeno.", closeCode: "" }, required)).toBe(false);
    expect(isResolveTicketsValid({ enabled: true, message: "Riješeno.", closeCode: "fixed" }, required)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./entra-redirect";

describe("safeReturnPath (paket 1.8)", () => {
  it("keeps in-app relative paths", () => {
    expect(safeReturnPath("/tickets/abc?view=all")).toBe("/tickets/abc?view=all");
  });

  it("rejects absolute, protocol-relative and loop targets", () => {
    expect(safeReturnPath("https://evil.example")).toBe("/");
    expect(safeReturnPath("//evil.example")).toBe("/");
    expect(safeReturnPath("/auth/callback")).toBe("/");
    expect(safeReturnPath("/login")).toBe("/");
    expect(safeReturnPath(null)).toBe("/");
    expect(safeReturnPath(undefined)).toBe("/");
  });
});

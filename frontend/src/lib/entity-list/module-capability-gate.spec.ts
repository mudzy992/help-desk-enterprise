import { describe, expect, it } from "vitest";
import { resolveModuleCapabilityGate } from "@/lib/entity-list/module-capability-gate";

describe("resolveModuleCapabilityGate", () => {
  it("never reports a failed capability request as disabled", () => {
    expect(
      resolveModuleCapabilityGate({
        isLoading: false,
        hasError: true,
        hasData: false,
      }),
    ).toBe("error");
  });

  it.each([
    [{ isLoading: true, hasError: false, hasData: false }, "loading"],
    [{ isLoading: false, hasError: false, hasData: true, enabled: false }, "disabled"],
    [
      { isLoading: false, hasError: false, hasData: true, enabled: true, canRead: false },
      "forbidden",
    ],
    [{ isLoading: false, hasError: false, hasData: true, enabled: true, canRead: true }, "ready"],
  ] as const)("maps %o to %s", (input, expected) => {
    expect(resolveModuleCapabilityGate(input)).toBe(expected);
  });
});

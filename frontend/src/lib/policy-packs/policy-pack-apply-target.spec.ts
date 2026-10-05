import { describe, expect, it } from "vitest";
import {
  buildPolicyPackApplyInput,
  hasPolicyPackTarget,
} from "@/lib/policy-packs/policy-pack-apply-target";

describe("policy pack apply target (val 5, M5 B3)", () => {
  const draft = (
    organizationalUnitId: string,
    serviceId: string,
  ): Parameters<typeof buildPolicyPackApplyInput>[0] => ({
    packKey: "PACK_IT_STANDARD",
    organizationalUnitId,
    serviceId,
  });

  it("accepts a service without an organisational unit", () => {
    expect(hasPolicyPackTarget(draft("", "svc-1"))).toBe(true);
    expect(buildPolicyPackApplyInput(draft("", "svc-1"))).toEqual({
      packKey: "PACK_IT_STANDARD",
      serviceId: "svc-1",
    });
  });

  it("accepts an organisational unit without a service", () => {
    expect(buildPolicyPackApplyInput(draft("ou-1", ""))).toEqual({
      packKey: "PACK_IT_STANDARD",
      organizationalUnitId: "ou-1",
    });
  });

  it("accepts both targets together", () => {
    expect(buildPolicyPackApplyInput(draft("ou-1", "svc-1"))).toEqual({
      packKey: "PACK_IT_STANDARD",
      organizationalUnitId: "ou-1",
      serviceId: "svc-1",
    });
  });

  it("reports a missing target instead of sending blank ids", () => {
    expect(hasPolicyPackTarget(draft("", ""))).toBe(false);
    expect(buildPolicyPackApplyInput(draft("", ""))).toEqual({
      packKey: "PACK_IT_STANDARD",
    });
  });
});

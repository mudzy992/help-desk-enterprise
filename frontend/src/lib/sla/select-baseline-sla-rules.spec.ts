import { describe, expect, it } from "vitest";
import {
  selectBaselineSlaRules,
  selectOverrideSlaRules,
} from "@/lib/sla/select-baseline-sla-rules";
import type { SlaRule } from "@/services/sla-types";

function rule(overrides: Partial<SlaRule>): SlaRule {
  return {
    id: "r1",
    slaProfileId: "p1",
    priority: "HIGH",
    responseMinutes: 30,
    resolutionMinutes: 240,
    evaluationOrder: 100,
    organizationalUnitId: null,
    organizationalUnitPath: null,
    serviceId: null,
    serviceName: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("select-baseline-sla-rules", () => {
  it("keeps lowest-order baseline per priority and separates overrides", () => {
    const rules = [
      rule({ id: "b1", priority: "HIGH", evaluationOrder: 20 }),
      rule({ id: "b0", priority: "HIGH", evaluationOrder: 10 }),
      rule({ id: "c1", priority: "CRITICAL", evaluationOrder: 5 }),
      rule({
        id: "o1",
        priority: "HIGH",
        serviceId: "svc-1",
        serviceName: "VPN",
        evaluationOrder: 1,
      }),
    ];

    expect(selectBaselineSlaRules(rules).map((item) => item.id)).toEqual([
      "c1",
      "b0",
    ]);
    expect(selectOverrideSlaRules(rules).map((item) => item.id)).toEqual(["o1"]);
  });
});

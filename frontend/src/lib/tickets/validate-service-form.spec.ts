import { describe, expect, it, vi } from "vitest";
import { validateServiceFormData } from "@/lib/tickets/validate-service-form";
import type { ServiceFormSchema } from "@/services/service-catalog-api";

const schema: ServiceFormSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: "hostname",
      label: "Hostname",
      type: "text",
      required: true,
      order: 1,
      validation: { minLength: 3 },
    },
    { id: "urgent", label: "Urgent", type: "boolean", required: true, order: 2 },
  ],
};

describe("validateServiceFormData", () => {
  it("accepts complete values and rejects missing required fields", () => {
    expect(validateServiceFormData(schema, { hostname: "laptop-1", urgent: false })).toEqual([]);
    expect(validateServiceFormData(schema, { hostname: "ab", urgent: true })).toEqual([
      { fieldId: "hostname", messageKey: "tickets.form.invalid" },
    ]);
    expect(validateServiceFormData(schema, {})).toEqual([
      { fieldId: "hostname", messageKey: "tickets.form.required" },
      { fieldId: "urgent", messageKey: "tickets.form.required" },
    ]);
    expect(validateServiceFormData(null, {})).toEqual([]);
  });

  it("never evaluates admin regexes in the browser backtracking engine", () => {
    const unsafePatternSchema: ServiceFormSchema = {
      schemaVersion: 1,
      fields: [
        {
          id: "payload",
          label: "Payload",
          type: "text",
          required: true,
          order: 0,
          validation: { pattern: "^(a+)+$" },
        },
      ],
    };
    const matcherSpy = vi.spyOn(RegExp.prototype, "test");
    const startedAt = performance.now();
    const result = validateServiceFormData(unsafePatternSchema, {
      payload: `${"a".repeat(4095)}!`,
    });
    const matcherCalls = matcherSpy.mock.calls.length;
    matcherSpy.mockRestore();

    expect(result).toEqual([]);
    expect(matcherCalls).toBe(0);
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });

  it("rejects patterned input above the UTF-8 byte cap in the browser", () => {
    const patternSchema: ServiceFormSchema = {
      schemaVersion: 1,
      fields: [
        {
          id: "label",
          label: "Label",
          type: "text",
          required: true,
          order: 0,
          validation: { pattern: "^é+$" },
        },
      ],
    };
    expect(validateServiceFormData(patternSchema, { label: "é".repeat(2049) })).toEqual([
      { fieldId: "label", messageKey: "tickets.form.invalid" },
    ]);
  });
});

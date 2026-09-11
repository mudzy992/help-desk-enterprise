import { describe, expect, it } from "vitest";
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
    expect(
      validateServiceFormData(schema, { hostname: "laptop-1", urgent: false }),
    ).toEqual([]);
    expect(validateServiceFormData(schema, { hostname: "ab", urgent: true })).toEqual([
      { fieldId: "hostname", messageKey: "tickets.form.invalid" },
    ]);
    expect(validateServiceFormData(schema, {})).toEqual([
      { fieldId: "hostname", messageKey: "tickets.form.required" },
      { fieldId: "urgent", messageKey: "tickets.form.required" },
    ]);
    expect(validateServiceFormData(null, {})).toEqual([]);
  });
});

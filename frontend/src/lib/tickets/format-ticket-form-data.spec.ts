import { describe, expect, it } from "vitest";
import { formatTicketFormData } from "@/lib/tickets/format-ticket-form-data";
import type { ServiceFormSchema } from "@/services/service-catalog-api";

const schema: ServiceFormSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: "request_type",
      label: "Request type",
      type: "select",
      required: true,
      order: 0,
      validation: { options: [{ value: "access", label: "Access request" }] },
    },
    {
      id: "devices",
      label: "Devices",
      type: "multiselect",
      required: false,
      order: 1,
      validation: { options: [{ value: "laptop", label: "Laptop" }] },
    },
    {
      id: "urgent",
      label: "Urgent",
      type: "boolean",
      required: false,
      order: 2,
    },
    {
      id: "quantity",
      label: "Quantity",
      type: "number",
      required: false,
      order: 3,
    },
    {
      id: "contact_email",
      label: "Contact email",
      type: "email",
      required: false,
      order: 4,
    },
  ],
};

describe("formatTicketFormData", () => {
  it("uses schema labels and option labels, preserves typed values, and shows unknown keys", () => {
    expect(
      formatTicketFormData(schema, {
        request_type: "access",
        devices: ["laptop", "unknown-device"],
        urgent: false,
        quantity: "4.0",
        contact_email: "user@example.com",
        retired_field: { note: "legacy" },
      }),
    ).toEqual([
      {
        key: "request_type",
        label: "Request type",
        value: "Access request",
        isBoolean: false,
        valueType: "select",
      },
      {
        key: "devices",
        label: "Devices",
        value: "Laptop, unknown-device",
        isBoolean: false,
        valueType: "multiselect",
      },
      {
        key: "urgent",
        label: "Urgent",
        value: "false",
        isBoolean: true,
        valueType: "boolean",
      },
      {
        key: "quantity",
        label: "Quantity",
        value: "4",
        isBoolean: false,
        valueType: "number",
      },
      {
        key: "contact_email",
        label: "Contact email",
        value: "user@example.com",
        isBoolean: false,
        valueType: "email",
      },
      {
        key: "retired_field",
        label: "retired_field",
        value: '{"note":"legacy"}',
        isBoolean: false,
        valueType: "unknown",
      },
    ]);
  });

  it("uses defensive key labels when no schema is bound", () => {
    expect(formatTicketFormData(null, { oldField: 17, ignored: null })).toEqual([
      {
        key: "oldField",
        label: "oldField",
        value: "17",
        isBoolean: false,
        valueType: "unknown",
      },
    ]);
    expect(formatTicketFormData(null, null)).toEqual([]);
  });
});

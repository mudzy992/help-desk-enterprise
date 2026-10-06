import type { ServiceFormSchema } from "@/services/service-catalog-api";

/// An active form version is required to activate a service. Ticket creation
/// binds it when forms are enabled; the form settings may also allow tickets
/// without a bound version. This mirrors the install schema and is a starting
/// point for further field authoring.
export const defaultServiceFormSchema: ServiceFormSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: "dodatne_informacije",
      label: "Dodatne informacije",
      type: "textarea",
      required: false,
      order: 0,
      validation: { maxLength: 4000 },
    },
  ],
};

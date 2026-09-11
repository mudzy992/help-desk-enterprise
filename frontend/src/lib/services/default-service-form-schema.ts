import type { ServiceFormSchema } from "@/services/service-catalog-api";

/// A ticket always stores a formVersionRef, so a service cannot accept tickets
/// until one of its form versions is ACTIVE. This mirrors the schema the
/// install wizard seeds, and is the starting point for further field authoring.
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

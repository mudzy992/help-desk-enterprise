import { useTranslation } from "react-i18next";
import { DetailSection } from "@/components/ui/detail-section";
import { formatTicketFormData } from "@/lib/tickets/format-ticket-form-data";
import type { ServiceFormSchema } from "@/services/service-catalog-api";

interface TicketFormDataViewProperties {
  readonly formData: unknown;
  readonly schema: ServiceFormSchema | null;
}

export function TicketFormDataView({ formData, schema }: TicketFormDataViewProperties) {
  const { t } = useTranslation();
  const entries = formatTicketFormData(schema, formData);
  if (entries.length === 0) return null;

  return (
    <DetailSection id="formData" title={t("tickets.detail.formData")} count={entries.length}>
      <dl className="space-y-2.5 text-[12px]">
        {entries.map((entry) => (
          <div key={entry.key} className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{entry.label}</dt>
            <dd className="text-right text-foreground/90" data-value-type={entry.valueType}>
              {entry.isBoolean
                ? t(entry.value === "true" ? "tickets.detail.formBooleanTrue" : "tickets.detail.formBooleanFalse")
                : entry.value}
            </dd>
          </div>
        ))}
      </dl>
    </DetailSection>
  );
}

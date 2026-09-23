import { useTranslation } from "react-i18next";
import { Card, CardHeader } from "@/components/ui/card";

interface TicketFormDataViewProperties {
  readonly formData: unknown;
}

export function TicketFormDataView({ formData }: TicketFormDataViewProperties) {
  const { t } = useTranslation();
  if (formData === null || formData === undefined || typeof formData !== "object") {
    return null;
  }
  const entries = Object.entries(formData as Record<string, unknown>);
  if (entries.length === 0) {
    return null;
  }
  return (
    <Card className="fade-in">
      <CardHeader title={t("tickets.detail.formData")} />
      <dl className="space-y-2.5 px-4 py-4 text-[12px]">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{key}</dt>
            <dd className="text-right text-foreground/90">
              {Array.isArray(value) ? value.join(", ") : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

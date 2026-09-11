import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";

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
    <Card className="px-4 py-3.5">
      <h3 className="text-[13.5px] font-semibold text-foreground">{t("tickets.detail.formData")}</h3>
      <dl className="mt-3 grid gap-3">
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt className="text-[11.5px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
              {key}
            </dt>
            <dd className="mt-0.5 text-[13px] text-foreground">
              {Array.isArray(value) ? value.join(", ") : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

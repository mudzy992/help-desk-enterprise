import { useTranslation } from "react-i18next";

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
    <section className="grid gap-2">
      <h3 className="text-body font-medium">{t("tickets.detail.formData")}</h3>
      <dl className="grid gap-2">
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt className="text-metadata text-muted-foreground">{key}</dt>
            <dd className="text-body">
              {Array.isArray(value) ? value.join(", ") : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

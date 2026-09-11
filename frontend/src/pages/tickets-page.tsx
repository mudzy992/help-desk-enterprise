import { useTranslation } from "react-i18next";
import { CreateTicketWithInterceptForm } from "@/components/tickets/create-ticket-with-intercept-form";

export function TicketsPage() {
  const { t } = useTranslation();
  return (
    <section className="max-w-6xl">
      <h2 className="text-section font-medium text-foreground">{t("tickets.title")}</h2>
      <p className="mt-2 text-body text-muted-foreground">{t("tickets.intro")}</p>
      <h3 className="mt-6 text-body font-medium text-foreground">
        {t("tickets.createHeading")}
      </h3>
      <CreateTicketWithInterceptForm />
    </section>
  );
}

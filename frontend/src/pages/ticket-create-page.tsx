import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CreateTicketForm } from "@/components/tickets/create-ticket-form";

export function TicketCreatePage() {
  const { t } = useTranslation();
  return (
    <section className="max-w-3xl">
      <Link
        to="/tickets"
        className="text-metadata text-muted-foreground hover:text-foreground hover:underline"
      >
        {t("tickets.backToInbox")}
      </Link>
      <h2 className="mt-4 text-section font-medium text-foreground">
        {t("tickets.createHeading")}
      </h2>
      <p className="mt-2 text-body text-muted-foreground">{t("tickets.intro")}</p>
      <CreateTicketForm />
    </section>
  );
}

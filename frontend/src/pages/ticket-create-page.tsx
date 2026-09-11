import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CreateTicketForm } from "@/components/tickets/create-ticket-form";
import { PageHeader } from "@/components/ui/page-header";

export function TicketCreatePage() {
  const { t } = useTranslation();
  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", t("tickets.title"), t("tickets.createHeading")]}
        title={t("tickets.createHeading")}
        subtitle={t("tickets.intro")}
        actions={
          <Link
            to="/tickets"
            className="text-[12.5px] text-[#7FA8F5] hover:underline"
          >
            {t("tickets.backToInbox")}
          </Link>
        }
      />
      <CreateTicketForm />
    </section>
  );
}

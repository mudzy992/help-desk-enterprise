import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CreateTicketForm } from "@/components/tickets/create-ticket-form";
import { PageHeader } from "@/components/ui/page-header";

export function TicketCreatePage() {
  const { t } = useTranslation();
  const ticketsTitle = t("tickets.title");
  const createHeading = t("tickets.createHeading");
  const createSubtitle = t("tickets.createSubtitle");
  const backToInbox = t("tickets.backToInbox");
  return (
    <section>
      <PageHeader
        crumbs={["EP-HelpDesk", ticketsTitle, createHeading]}
        title={createHeading}
        subtitle={createSubtitle}
        actions={
          <Link
            to="/tickets"
            className="text-[12.5px] text-[#7FA8F5] hover:underline"
          >
            {backToInbox}
          </Link>
        }
      />
      <CreateTicketForm />
    </section>
  );
}

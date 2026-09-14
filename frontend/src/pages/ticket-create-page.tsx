import { useTranslation } from "react-i18next";
import { CreateTicketForm } from "@/components/tickets/create-ticket-form";
import { PageHeader } from "@/components/ui/page-header";

export function TicketCreatePage() {
  const { t } = useTranslation();
  const ticketsTitle = t("tickets.title");
  const createHeading = t("tickets.createHeading");
  const createSubtitle = t("tickets.createSubtitle");
  return (
    <section className="mx-auto max-w-[1060px]">
      <PageHeader
        crumbs={["EP-HelpDesk", ticketsTitle, createHeading]}
        title={createHeading}
        subtitle={createSubtitle}
      />
      <CreateTicketForm />
    </section>
  );
}

import { useTranslation } from "react-i18next";
import { CreateTicketDraftView } from "@/components/tickets/create-ticket-draft-view";
import { CreateTicketFollowUpViews } from "@/components/tickets/create-ticket-follow-up-views";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useCreateTicketFormModel } from "@/lib/tickets/use-create-ticket-form-model";

export function CreateTicketForm() {
  const { t } = useTranslation();
  const form = useCreateTicketFormModel();

  if (form.isLoading) {
    return <PanelSkeleton label={t("tickets.loading")} />;
  }
  if (form.step === 2 || form.step === 3) {
    return <CreateTicketFollowUpViews {...form.followUpView} />;
  }
  return <CreateTicketDraftView {...form.draftView} />;
}

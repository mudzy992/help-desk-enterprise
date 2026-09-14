import { BookOpen, FileText, ListChecks, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { WizardStepper } from "@/components/ui/wizard-stepper";

export const CREATE_TICKET_STEP_TOTAL = 4;

interface CreateTicketStepperProperties {
  readonly activeIndex: number;
}

export function CreateTicketStepper({ activeIndex }: CreateTicketStepperProperties) {
  const { t } = useTranslation();
  return (
    <WizardStepper
      activeIndex={activeIndex}
      steps={[
        { key: "service", label: t("tickets.createStepService"), icon: <ListChecks size={13} /> },
        { key: "details", label: t("tickets.createStepDetails"), icon: <FileText size={13} /> },
        { key: "kb", label: t("tickets.createStepKnowledge"), icon: <BookOpen size={13} /> },
        { key: "review", label: t("tickets.createStepReview"), icon: <Send size={13} /> },
      ]}
    />
  );
}

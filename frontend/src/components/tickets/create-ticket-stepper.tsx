import { BookOpen, FileText, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { WizardStepper } from "@/components/ui/wizard-stepper";

interface CreateTicketStepperProperties {
  readonly activeIndex: number;
}

export function CreateTicketStepper({ activeIndex }: CreateTicketStepperProperties) {
  const { t } = useTranslation();
  const serviceLabel = t("tickets.createStepService");
  const detailsLabel = t("tickets.createStepDetails");
  const knowledgeLabel = t("tickets.createStepKnowledge");
  return (
    <WizardStepper
      activeIndex={activeIndex}
      steps={[
        { key: "service", label: serviceLabel, icon: <ListChecks size={13} /> },
        { key: "details", label: detailsLabel, icon: <FileText size={13} /> },
        { key: "kb", label: knowledgeLabel, icon: <BookOpen size={13} /> },
      ]}
    />
  );
}

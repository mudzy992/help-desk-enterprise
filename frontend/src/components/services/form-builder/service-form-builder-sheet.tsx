import { useTranslation } from "react-i18next";
import { ServiceFormBuilder } from "@/components/services/form-builder/service-form-builder";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

interface ServiceFormBuilderSheetProperties {
  readonly serviceId: string | null;
  readonly canWrite: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
}

export function ServiceFormBuilderSheet({
  serviceId,
  canWrite,
  onOpenChange,
  onChanged,
}: ServiceFormBuilderSheetProperties) {
  const { t } = useTranslation();
  return (
    <Sheet open={serviceId !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-3xl flex-col overflow-y-auto p-5">
        <SheetTitle>{t("services.manageForm")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("services.catalogHint")}
        </SheetDescription>
        {serviceId ? (
          <div className="mt-4">
            <ServiceFormBuilder
              serviceId={serviceId}
              canWrite={canWrite}
              onActiveVersion={() => {
                void onChanged();
              }}
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

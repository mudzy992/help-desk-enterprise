import { useTranslation } from "react-i18next";
import { ServiceDowntimeWindowsPanel } from "@/components/services/service-downtime-windows-panel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

interface ServiceDowntimeWindowsSheetProperties {
  readonly serviceId: string | null;
  readonly serviceName: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
}

export function ServiceDowntimeWindowsSheet({
  serviceId,
  serviceName,
  onOpenChange,
  onChanged,
}: ServiceDowntimeWindowsSheetProperties) {
  const { t } = useTranslation();
  const open = serviceId !== null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>{t("services.downtime.heading")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("services.downtime.sheetHint", { name: serviceName })}
        </SheetDescription>
        {serviceId !== null ? (
          <div className="mt-4">
            <ServiceDowntimeWindowsPanel
              serviceId={serviceId}
              onChanged={onChanged}
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";

export function CreateTicketSidePanel() {
  const { t } = useTranslation();
  const items = [
    t("tickets.createAfterRouting"),
    t("tickets.createAfterSla"),
    t("tickets.createAfterApproval"),
    t("tickets.createAfterInbox"),
    t("tickets.createAfterNotify"),
  ];
  return (
    <Card>
      <div className="px-4 py-3.5">
        <p className="text-[12.5px] font-semibold text-foreground">{t("tickets.createAfterTitle")}</p>
        <ol className="mt-2.5 space-y-2.5">
          {items.map((item, index) => (
            <li key={item} className="flex gap-2.5 text-[11.5px] leading-[18px] text-muted-foreground">
              <span className="tnum flex size-[18px] shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-[10px] font-semibold text-link">
                {index + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

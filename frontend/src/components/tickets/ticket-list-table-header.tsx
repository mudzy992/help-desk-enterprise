import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { tableHeadClassName } from "@/components/ui/control";
import { cn } from "@/lib/utils";

interface TicketListTableHeaderProperties {
  readonly allSelected: boolean;
  readonly someSelected: boolean;
  readonly isVirtualized: boolean;
  readonly onTogglePage: (selected: boolean) => void;
}

export function TicketListTableHeader({
  allSelected,
  someSelected,
  isVirtualized,
  onTogglePage,
}: TicketListTableHeaderProperties) {
  const { t } = useTranslation();
  return (
    <thead className={isVirtualized ? "sticky top-0 z-10 bg-surface" : undefined}>
      <tr
        className={cn("border-b border-border/70 bg-elevated/60", tableHeadClassName)}
        aria-rowindex={1}
      >
        <th className="w-10 px-4 py-2.5">
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={(event) => onTogglePage(event.target.checked)}
            aria-label={t("tickets.bulk.select")}
          />
        </th>
        <th scope="col" className="px-2 py-2.5 font-medium">
          {t("tickets.columns.ticket")}
        </th>
        <th scope="col" className="px-4 py-2.5 font-medium">
          {t("tickets.columns.service")}
        </th>
        <th scope="col" className="px-4 py-2.5 font-medium">
          {t("tickets.columns.unit")}
        </th>
        <th scope="col" className="px-4 py-2.5 font-medium">
          {t("tickets.columns.status")}
        </th>
        <th scope="col" className="px-4 py-2.5 font-medium">
          {t("tickets.columns.priority")}
        </th>
        <th scope="col" className="px-4 py-2.5 font-medium">
          {t("tickets.columns.assignment")}
        </th>
        <th scope="col" className="px-4 py-2.5 text-right font-medium">
          {t("tickets.columns.updated")}
        </th>
      </tr>
    </thead>
  );
}

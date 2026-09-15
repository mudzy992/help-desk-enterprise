import { CalendarRange } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlCompactClassName } from "@/components/ui/control";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  reportPresets,
  type ReportPreset,
} from "@/lib/reports/report-window";

interface ReportsDateFilterProperties {
  readonly preset: ReportPreset;
  readonly customFrom: string;
  readonly customTo: string;
  readonly onPresetChange: (preset: ReportPreset) => void;
  readonly onCustomFromChange: (value: string) => void;
  readonly onCustomToChange: (value: string) => void;
}

const presetKeys = {
  "15d": "reports.window15d",
  "30d": "reports.window30d",
  "6m": "reports.window6m",
  "12m": "reports.window12m",
  custom: "reports.windowCustom",
} as const;

export function ReportsDateFilter({
  preset,
  customFrom,
  customTo,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
}: ReportsDateFilterProperties) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <CalendarRange size={14} />
            {t(presetKeys[preset])}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {reportPresets.map((item) => (
            <DropdownMenuItem
              key={item}
              onSelect={() => onPresetChange(item)}
            >
              {t(presetKeys[item])}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {preset === "custom" ? (
        <>
          <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            {t("reports.windowFrom")}
            <input
              type="date"
              className={cn(controlCompactClassName, "w-[10.5rem]")}
              value={customFrom}
              onChange={(event) => onCustomFromChange(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            {t("reports.windowTo")}
            <input
              type="date"
              className={cn(controlCompactClassName, "w-[10.5rem]")}
              value={customTo}
              onChange={(event) => onCustomToChange(event.target.value)}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}

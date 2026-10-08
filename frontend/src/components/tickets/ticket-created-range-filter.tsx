import { CalendarRange } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { controlCompactClassName, selectCompactClassName } from "@/components/ui/control";
import {
  createdRangePresets,
  detectCreatedRangePreset,
  instantToLocalDateInput,
  rangeForPreset,
  rangeFromLocalDays,
  type CreatedRange,
  type CreatedRangePreset,
} from "@/lib/tickets/created-range";
import { cn } from "@/lib/utils";

interface TicketCreatedRangeFilterProperties {
  readonly value: CreatedRange;
  readonly onChange: (range: CreatedRange) => void;
}

const presetLabelKeys = {
  any: "tickets.filters.created.any",
  today: "tickets.filters.created.today",
  last7: "tickets.filters.created.last7",
  last30: "tickets.filters.created.last30",
  thisMonth: "tickets.filters.created.thisMonth",
  custom: "tickets.filters.created.custom",
} as const satisfies Record<CreatedRangePreset, string>;

/**
 * Paket 5.3.1: "Created" range of the ticket list — presets plus two day
 * pickers for a custom range. Days are the user's local calendar days; the
 * filter state holds the resulting instants (see `created-range.ts`).
 */
export function TicketCreatedRangeFilter({ value, onChange }: TicketCreatedRangeFilterProperties) {
  const { t } = useTranslation();
  const id = useId();
  const detected = detectCreatedRangePreset(value);
  // "Custom" with nothing picked yet has no range to detect it from.
  const [isCustomOpen, setIsCustomOpen] = useState(detected === "custom");
  const preset: CreatedRangePreset = isCustomOpen ? "custom" : detected;
  const [fromDay, setFromDay] = useState(() => instantToLocalDateInput(value.createdFrom));
  const [toDay, setToDay] = useState(() => instantToLocalDateInput(value.createdTo));

  // A saved view or "clear filters" replaces the range from outside.
  useEffect(() => {
    setFromDay(instantToLocalDateInput(value.createdFrom));
    setToDay(instantToLocalDateInput(value.createdTo));
    const next = detectCreatedRangePreset({ createdFrom: value.createdFrom, createdTo: value.createdTo });
    if (next === "custom") setIsCustomOpen(true);
    if (next === "any") setIsCustomOpen(false);
  }, [value.createdFrom, value.createdTo]);

  const isInverted = fromDay !== "" && toDay !== "" && fromDay > toDay;

  const applyDays = (nextFrom: string, nextTo: string) => {
    setFromDay(nextFrom);
    setToDay(nextTo);
    if (nextFrom !== "" && nextTo !== "" && nextFrom > nextTo) return;
    onChange(rangeFromLocalDays(nextFrom, nextTo));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="ticket-created-range">
      <CalendarRange size={13} className="text-muted-foreground" aria-hidden="true" />
      <label className="sr-only" htmlFor={`${id}-preset`}>
        {t("tickets.filters.created.label")}
      </label>
      <select
        id={`${id}-preset`}
        data-testid="ticket-created-preset"
        className={cn(selectCompactClassName, "w-auto min-w-[9rem]")}
        value={preset}
        onChange={(event) => {
          const next = event.target.value as CreatedRangePreset;
          if (next === "custom") {
            setIsCustomOpen(true);
            return;
          }
          setIsCustomOpen(false);
          const range = rangeForPreset(next);
          if (range !== null) onChange(range);
        }}
      >
        {createdRangePresets.map((item) => (
          <option key={item} value={item}>
            {t(presetLabelKeys[item])}
          </option>
        ))}
      </select>
      {preset === "custom" ? (
        <>
          <label className="sr-only" htmlFor={`${id}-from`}>
            {t("tickets.filters.created.from")}
          </label>
          <input
            id={`${id}-from`}
            type="date"
            data-testid="ticket-created-from"
            className={cn(controlCompactClassName, "w-[9.5rem]")}
            value={fromDay}
            max={toDay || undefined}
            aria-invalid={isInverted ? true : undefined}
            aria-describedby={isInverted ? `${id}-error` : undefined}
            onChange={(event) => applyDays(event.target.value, toDay)}
          />
          <span className="text-[12px] text-muted-foreground" aria-hidden="true">
            –
          </span>
          <label className="sr-only" htmlFor={`${id}-to`}>
            {t("tickets.filters.created.to")}
          </label>
          <input
            id={`${id}-to`}
            type="date"
            data-testid="ticket-created-to"
            className={cn(controlCompactClassName, "w-[9.5rem]")}
            value={toDay}
            min={fromDay || undefined}
            aria-invalid={isInverted ? true : undefined}
            aria-describedby={isInverted ? `${id}-error` : undefined}
            onChange={(event) => applyDays(fromDay, event.target.value)}
          />
          {isInverted ? (
            <p id={`${id}-error`} role="alert" className="w-full text-[11.5px] text-danger sm:w-auto">
              {t("tickets.filters.created.inverted")}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

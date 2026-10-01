import { useId, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Chip } from "@/components/ui/chip";
import { hintClassName } from "@/components/ui/control";
import { Input } from "@/components/ui/field";

type Option = { readonly id: string; readonly name: string };

interface ChangeServicePickerProperties {
  readonly label: string;
  readonly options: readonly Option[];
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly disabled?: boolean;
  readonly hint?: string;
}

const visibleMax = 8;

/**
 * Paket 3.4 (§11): several services for one change. Chosen services are chips;
 * a filter narrows the rest (the catalog can hold hundreds of services).
 */
export function ChangeServicePicker({ label, options, value, onChange, disabled, hint }: ChangeServicePickerProperties) {
  const { t } = useTranslation();
  const id = useId();
  const [filter, setFilter] = useState("");
  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const text = filter.trim().toLocaleLowerCase();
  const candidates = options.filter((option) => !value.includes(option.id) && (text === "" || option.name.toLocaleLowerCase().includes(text)));

  return (
    <fieldset className="grid gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-[12.5px] font-medium text-foreground">{label}</legend>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label={t("changes.form.selectedServices")}>
          {value.map((serviceId) => (
            <Chip
              key={serviceId}
              active
              onRemove={disabled ? undefined : () => onChange(value.filter((item) => item !== serviceId))}
              removeLabel={t("changes.form.removeService", { name: byId.get(serviceId)?.name ?? serviceId })}
            >
              {byId.get(serviceId)?.name ?? serviceId}
            </Chip>
          ))}
        </div>
      ) : (
        <p className={hintClassName}>{t("changes.form.noServices")}</p>
      )}
      <Input
        id={`${id}-filter`}
        value={filter}
        maxLength={120}
        onChange={(event) => setFilter(event.target.value)}
        placeholder={t("changes.form.serviceSearch")}
        aria-label={t("changes.form.serviceSearch")}
      />
      <ul className="grid max-h-40 gap-0.5 overflow-y-auto rounded-md border border-border p-1" aria-label={t("changes.form.serviceResults")}>
        {candidates.length === 0 ? (
          <li className={`px-2 py-1 ${hintClassName}`}>{t("changes.form.serviceNone")}</li>
        ) : (
          candidates.slice(0, visibleMax).map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className="flex w-full items-center gap-1.5 truncate rounded-md px-2 py-1 text-left text-[12.5px] text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                onClick={() => {
                  onChange([...value, option.id]);
                  setFilter("");
                }}
              >
                <Plus size={12} aria-hidden="true" className="shrink-0 text-muted-foreground" />
                {option.name}
              </button>
            </li>
          ))
        )}
        {candidates.length > visibleMax ? <li className={`px-2 py-1 ${hintClassName}`}>{t("changes.form.serviceMore", { count: candidates.length - visibleMax })}</li> : null}
      </ul>
      {hint ? <p className={hintClassName}>{hint}</p> : null}
    </fieldset>
  );
}

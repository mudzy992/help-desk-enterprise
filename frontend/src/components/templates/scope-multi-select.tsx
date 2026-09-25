import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { controlCompactClassName, labelClassName } from "@/components/ui/control";
import { cn } from "@/lib/utils";

export type ScopeOption = { readonly id: string; readonly name: string; readonly hint?: string };

interface ScopeMultiSelectProperties {
  readonly label: string;
  readonly options: readonly ScopeOption[];
  readonly value: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
  readonly disabled?: boolean;
  readonly testId?: string;
}

/**
 * Paket 1.4 (A1): compact searchable multi-select for the template/playbook
 * scope (services, categories, groups). Selected items float to the top so a
 * long catalog never hides what is already chosen.
 */
export function ScopeMultiSelect({ label, options, value, onChange, disabled = false, testId }: ScopeMultiSelectProperties) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const labelId = useId();
  const selected = useMemo(() => new Set(value), [value]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("bs");
    return options
      .filter((option) => needle.length === 0 || option.name.toLocaleLowerCase("bs").includes(needle))
      .sort(
        (a, b) =>
          Number(selected.has(b.id)) - Number(selected.has(a.id)) || a.name.localeCompare(b.name, "bs"),
      );
  }, [options, query, selected]);

  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...value, id] : value.filter((item) => item !== id));
  };

  return (
    <div role="group" aria-labelledby={labelId} data-testid={testId}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span id={labelId} className={labelClassName}>
          {label}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {t("templates.editor.selectedCount", { count: value.length })}
        </span>
      </div>
      <div className="rounded-md border border-border bg-surface">
        <div className="relative border-b border-border/70 p-1.5">
          <Search size={13} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={`${label}: ${t("templates.list.search")}`}
            className={cn(controlCompactClassName, "pl-7")}
            disabled={disabled}
          />
        </div>
        <ul className="max-h-40 space-y-1 overflow-y-auto p-2">
          {visible.length === 0 ? (
            <li className="text-[12px] text-muted-foreground">{t("templates.editor.filterNone")}</li>
          ) : (
            visible.map((option) => (
              <li key={option.id}>
                <Checkbox
                  checked={selected.has(option.id)}
                  onChange={(event) => toggle(option.id, event.target.checked)}
                  disabled={disabled}
                  label={
                    <span className="text-[12.5px] text-foreground">
                      {option.name}
                      {option.hint ? (
                        <span className="ml-1.5 text-[11px] text-muted-foreground">{option.hint}</span>
                      ) : null}
                    </span>
                  }
                />
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

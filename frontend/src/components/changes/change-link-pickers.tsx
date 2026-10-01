import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { hintClassName } from "@/components/ui/control";
import { Input } from "@/components/ui/field";
import {
  changeExtraKeys,
  searchChangeAssets,
  searchChangeProblems,
  type ChangeAssetOption,
  type ChangeProblemOption,
} from "@/services/changes-api";

function useDebounced(value: string, delay = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value.trim()), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

const resultButtonClassName =
  "flex w-full items-center gap-1.5 truncate rounded-md px-2 py-1 text-left text-[12.5px] text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

/** Paket 3.4 (§11): equipment touched by the change (only while the CMDB is on). */
export function ChangeAssetPicker({
  value,
  onChange,
  disabled,
}: {
  readonly value: readonly ChangeAssetOption[];
  readonly onChange: (next: ChangeAssetOption[]) => void;
  readonly disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const term = useDebounced(search);
  const results = useQuery({
    queryKey: changeExtraKeys.assetSearch(term),
    queryFn: () => searchChangeAssets(term),
    enabled: term.length >= 2 && !disabled,
    retry: false,
  });
  const candidates = (results.data?.items ?? []).filter((item) => !value.some((chosen) => chosen.id === item.id));
  return (
    <fieldset className="grid gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-[12.5px] font-medium text-foreground">{t("changes.fields.assets")}</legend>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((asset) => (
            <Chip
              key={asset.id}
              active
              onRemove={disabled ? undefined : () => onChange(value.filter((item) => item.id !== asset.id))}
              removeLabel={t("changes.form.removeAsset", { tag: asset.assetTag })}
            >
              {asset.assetTag} · {asset.name}
            </Chip>
          ))}
        </div>
      ) : null}
      <Input value={search} maxLength={120} onChange={(event) => setSearch(event.target.value)} placeholder={t("changes.form.assetSearch")} aria-label={t("changes.form.assetSearch")} />
      {term.length >= 2 ? (
        <ul className="grid max-h-40 gap-0.5 overflow-y-auto rounded-md border border-border p-1" aria-label={t("changes.form.assetResults")}>
          {candidates.length === 0 ? (
            <li className={`px-2 py-1 ${hintClassName}`}>{results.isFetching ? t("ui.loading") : t("changes.form.assetNone")}</li>
          ) : (
            candidates.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={resultButtonClassName}
                  onClick={() => {
                    onChange([...value, item]);
                    setSearch("");
                  }}
                >
                  <Plus size={12} aria-hidden="true" className="shrink-0 text-muted-foreground" />
                  <span className="tnum font-medium">{item.assetTag}</span>
                  <span className="truncate text-muted-foreground">{item.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : (
        <p className={hintClassName}>{t("changes.form.assetHint")}</p>
      )}
    </fieldset>
  );
}

/** Paket 3.4 (§11): at most one problem the change fixes (only while the problem module is on). */
export function ChangeProblemPicker({
  value,
  onChange,
  disabled,
}: {
  readonly value: ChangeProblemOption | null;
  readonly onChange: (next: ChangeProblemOption | null) => void;
  readonly disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const term = useDebounced(search);
  const results = useQuery({
    queryKey: changeExtraKeys.problemSearch(term),
    queryFn: () => searchChangeProblems(term),
    enabled: term.length >= 1 && value === null && !disabled,
    retry: false,
  });
  return (
    <div className="grid gap-1.5">
      <span className="text-[12.5px] font-medium text-foreground">{t("changes.fields.problem")}</span>
      {value !== null ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-[12.5px]">
          <span className="min-w-0 truncate">
            <span className="tnum font-medium text-foreground">{value.number}</span> <span className="text-muted-foreground">{value.title}</span>
          </span>
          {disabled ? null : (
            <Button type="button" variant="ghost" size="icon" aria-label={t("changes.form.clearProblem")} onClick={() => onChange(null)}>
              <X size={13} aria-hidden="true" />
            </Button>
          )}
        </div>
      ) : (
        <>
          <Input
            value={search}
            maxLength={120}
            disabled={disabled}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("changes.form.problemSearch")}
            aria-label={t("changes.form.problemSearch")}
          />
          {term.length >= 1 ? (
            <ul className="grid max-h-40 gap-0.5 overflow-y-auto rounded-md border border-border p-1" aria-label={t("changes.form.problemResults")}>
              {(results.data?.items ?? []).length === 0 ? (
                <li className={`px-2 py-1 ${hintClassName}`}>{results.isFetching ? t("ui.loading") : t("changes.form.problemNone")}</li>
              ) : (
                (results.data?.items ?? []).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={resultButtonClassName}
                      onClick={() => {
                        onChange(item);
                        setSearch("");
                      }}
                    >
                      <span className="tnum font-medium">{item.number}</span>
                      <span className="truncate text-muted-foreground">{item.title}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : (
            <p className={hintClassName}>{t("changes.form.problemHint")}</p>
          )}
        </>
      )}
    </div>
  );
}

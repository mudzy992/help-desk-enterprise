import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlCompactClassName } from "@/components/ui/control";
import type { OriginUnitOption } from "@/lib/tickets/ticket-display";
import type { GroupListItemResponse } from "@/services/groups-api";

interface GroupMutationFormProperties {
  readonly originUnits: readonly OriginUnitOption[];
  readonly initial?: GroupListItemResponse | null;
  readonly pending: boolean;
  readonly onSubmit: (input: {
    readonly name: string;
    readonly organizationalUnitId: string;
    readonly isFallback: boolean;
  }) => void;
  readonly onCancel: () => void;
}

export function GroupMutationForm({
  originUnits,
  initial = null,
  pending,
  onSubmit,
  onCancel,
}: GroupMutationFormProperties) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [organizationalUnitId, setOrganizationalUnitId] = useState(
    initial?.organizationalUnitId ?? originUnits[0]?.id ?? "",
  );
  const [isFallback, setIsFallback] = useState(initial?.isFallback ?? false);

  const handleSubmit = () => {
    onSubmit({ name, organizationalUnitId, isFallback });
  };

  return (
    <div className="grid gap-3 rounded-lg border border-border/70 bg-elevated/20 p-4">
      <label className="grid gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          {t("groups.form.name")}
        </span>
        <input
          className={controlCompactClassName}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label={t("groups.form.name")}
        />
      </label>
      <label className="grid gap-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          {t("groups.form.organizationalUnit")}
        </span>
        <select
          className={controlCompactClassName}
          value={organizationalUnitId}
          disabled={initial !== null}
          onChange={(event) => setOrganizationalUnitId(event.target.value)}
          aria-label={t("groups.form.organizationalUnit")}
        >
          {originUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={isFallback}
          onChange={(event) => setIsFallback(event.target.checked)}
        />
        {t("groups.form.fallback")}
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={handleSubmit}>
          {pending
            ? t("groups.form.saving")
            : initial === null
              ? t("groups.form.create")
              : t("groups.form.save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("groups.form.cancel")}
        </Button>
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { hintClassName, labelClassName, selectClassName } from "@/components/ui/control";
import { getTicketAssetPicker, ticketAssetQueryKeys } from "@/services/assets-api";

/**
 * Paket 3.2 (§8): "Which equipment is this about?" — optional, only the
 * requester's own equipment, never preselected unless the user came from
 * "Report a problem" on My equipment. Hidden when the module or the picker
 * is off, or the user has no selectable equipment.
 */
export function CreateTicketAssetPicker({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (assetId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({
    queryKey: ticketAssetQueryKeys.picker,
    queryFn: getTicketAssetPicker,
    retry: false,
    staleTime: 60_000,
  });
  const items = data?.enabled === true ? data.items : [];
  const known = value === "" || items.some((item) => item.id === value);

  // A stale or foreign ?assetId= never reaches the backend.
  useEffect(() => {
    if (data !== undefined && !known) onChange("");
  }, [data, known, onChange]);

  if (items.length === 0) return null;
  const english = i18n.language.startsWith("en");
  return (
    <label className={`${labelClassName} md:col-span-2`}>
      <span>{t("assets.ticket.pickerLabel")}</span>
      <select className={selectClassName} value={known ? value : ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t("assets.ticket.pickerNone")}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {item.assetTag} ({english ? item.typeNameEn : item.typeName})
          </option>
        ))}
      </select>
      <span className={hintClassName}>{t("assets.ticket.pickerHint")}</span>
    </label>
  );
}

import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

/** Paket 3.2 (§9, §10): days left until a licence or contract ends. */
export function AssetExpiryBadge({ daysLeft }: { readonly daysLeft: number | null }) {
  const { t } = useTranslation();
  if (daysLeft === null) return null;
  if (daysLeft < 0) return <Badge tone="danger">{t("assets.expiry.expired")}</Badge>;
  if (daysLeft === 0) return <Badge tone="danger">{t("assets.expiry.today")}</Badge>;
  return <Badge tone={daysLeft <= 30 ? "warning" : "neutral"}>{t("assets.expiry.days", { count: daysLeft })}</Badge>;
}

/** "" → null, otherwise a non-negative number with at most two decimals. */
export function parseMoneyInput(value: string): number | null | "invalid" {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(trimmed)) return "invalid";
  return Number(trimmed);
}

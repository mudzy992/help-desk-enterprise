import { ArrowRight, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Paket 5.4.0-e.2 (UI polish): Postavke no longer host a second copy of the
 * security administration cards. The SuperAdmin gets one row that says where
 * they are and takes them there (the same pattern the Nadzor tab uses for the
 * Teams administration), so „Postavke → Sigurnost" never looks half-empty.
 */
export function AdminSecurityPointerCard() {
  const { t } = useTranslation();
  return (
    <Card className="fade-in" data-testid="admin-security-pointer-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <ShieldCheck size={14} className="text-link" />
            {t("settings.securityPointer.title")}
          </p>
          <p className="mt-1 text-[11.5px] leading-[15px] text-muted-foreground">
            {t("settings.securityPointer.body")}
          </p>
        </div>
        <Button asChild size="xs" variant="outline">
          <Link to="/admin?tab=security">
            {t("settings.securityPointer.open")} <ArrowRight size={12} />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

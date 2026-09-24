import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function TicketInboxUnroutedBanner() {
  const { t } = useTranslation();
  return (
    <div className="fade-in mb-3 flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/6 px-4 py-3">
      <ShieldAlert
        size={16}
        className="mt-0.5 shrink-0 text-danger"
        aria-hidden="true"
      />
      <p className="flex-1 text-[12.5px] leading-5 text-foreground/90">
        {t("tickets.unroutedBanner")}
      </p>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link to="/routing">{t("tickets.inboxOpenRouting")}</Link>
      </Button>
    </div>
  );
}

import { Lock, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface TicketConfidentialBannerProperties {
  readonly onBreakGlass?: () => void;
}

export function TicketConfidentialBanner({
  onBreakGlass,
}: TicketConfidentialBannerProperties) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-warning/25 bg-warning/6 px-5 py-2.5">
      <ShieldAlert size={15} className="shrink-0 text-warning" aria-hidden="true" />
      <p className="flex-1 text-[12px] leading-[18px] text-foreground/90">
        {t("tickets.confidential.banner")}
      </p>
      {onBreakGlass ? (
        <Button type="button" variant="outline" size="xs" onClick={onBreakGlass}>
          <Lock size={12} /> {t("tickets.confidential.request")}
        </Button>
      ) : null}
    </div>
  );
}

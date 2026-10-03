import { HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { docsHref, docsTargetForPath } from "@/lib/docs/docs-slug";

/**
 * Faza 3 (d): kontekstualna „?“ pomoć u zaglavlju — vodi na stranicu
 * dokumentacije koja opisuje ekran na kojem se korisnik nalazi. Ne prikazuje se
 * na samoj Dokumentaciji ni na ekranima bez mapirane stranice.
 */
export function DocsHelpButton() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const target = pathname.startsWith("/docs") ? null : docsTargetForPath(pathname);
  if (target === null) {
    return null;
  }
  const label = t("docs.helpLabel");
  return (
    <Button asChild className="text-muted-foreground print:hidden" size="icon" variant="ghost">
      <Link aria-label={label} title={label} to={docsHref(target)}>
        <HelpCircle size={17} strokeWidth={1.9} />
      </Link>
    </Button>
  );
}

import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

/**
 * Paket 2.7 (§8): the chip opens the status page. It deliberately does not
 * poll the status API from every open tab - the page itself refreshes.
 */
export function SystemStatusChip() {
  const { t } = useTranslation();
  return (
    <Link
      to="/status"
      title={t("status.chipTitle")}
      className="mr-1 hidden items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1.5 transition-colors duration-150 hover:border-line-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary/70 md:flex"
    >
      <span className="dot-pulse size-1.5 rounded-full bg-ok" />
      <span className="text-[11.5px] text-muted-foreground">
        {t("shell.systemsPrefix")}{" "}
        <span className="text-foreground/85">{t("shell.systemsLive")}</span>
      </span>
    </Link>
  );
}

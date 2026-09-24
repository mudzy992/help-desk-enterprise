import { useTranslation } from "react-i18next";

export function SystemStatusChip() {
  const { t } = useTranslation();
  return (
    <div className="mr-1 hidden items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1.5 md:flex">
      <span className="dot-pulse size-1.5 rounded-full bg-ok" />
      <span className="text-[11.5px] text-muted-foreground">
        {t("shell.systemsPrefix")}{" "}
        <span className="text-foreground/85">{t("shell.systemsLive")}</span>
      </span>
    </div>
  );
}

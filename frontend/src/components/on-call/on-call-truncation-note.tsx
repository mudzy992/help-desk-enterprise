import { useTranslation } from "react-i18next";

/** Note shown when a server-capped list (BA-on-call-11) is not complete. */
export function OnCallTruncationNote({ limit }: { readonly limit: number }) {
  const { t } = useTranslation();
  return (
    <p className="text-[12px] leading-relaxed text-muted-foreground">
      {t("onCall.listTruncated", { limit })}
    </p>
  );
}

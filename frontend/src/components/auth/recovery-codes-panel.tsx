import { Copy, Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface RecoveryCodesPanelProperties {
  readonly codes: readonly string[];
  readonly onDone: () => void;
  readonly doneLabel?: string;
}

/** Paket 2.1 (M4): shown exactly once; the user confirms they were saved. */
export function RecoveryCodesPanel({ codes, onDone, doneLabel }: RecoveryCodesPanelProperties) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  const download = () => {
    const blob = new Blob([`EP HelpDesk — ${t("auth.mfa.recoveryTitle")}\n\n${text}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ephelpdesk-recovery-codes.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] leading-5 text-muted-foreground">{t("auth.mfa.recoveryIntro")}</p>
      <ul className="tnum grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border border-border bg-elevated/60 p-3 text-[13px] font-medium text-foreground" data-testid="recovery-codes">
        {codes.map((code) => (
          <li key={code} className="select-all">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(text)
              .then(() => setCopied(true))
              .catch(() => undefined);
          }}
        >
          <Copy /> {copied ? t("auth.mfa.copied") : t("auth.mfa.copy")}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={download}>
          <Download /> {t("auth.mfa.download")}
        </Button>
      </div>
      <div className="pt-1">
        <Checkbox
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
          label={t("auth.mfa.recoverySaved")}
        />
      </div>
      <Button type="button" className="w-full" disabled={!saved} onClick={onDone}>
        {doneLabel ?? t("auth.mfa.continue")}
      </Button>
    </div>
  );
}

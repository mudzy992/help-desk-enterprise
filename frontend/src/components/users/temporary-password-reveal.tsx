import { Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export type TemporaryPasswordRevealPayload = {
  readonly temporaryPassword: string | null;
  readonly temporaryPasswordDelivery: "ui" | "email";
};

interface TemporaryPasswordRevealProperties {
  readonly result: TemporaryPasswordRevealPayload;
  readonly onClose: () => void;
}

export function TemporaryPasswordReveal({
  result,
  onClose,
}: TemporaryPasswordRevealProperties) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  if (result.temporaryPasswordDelivery === "email") {
    return (
      <div className="space-y-2 border-b border-border/60 px-4 py-3">
        <p className="text-[13px] text-foreground" role="status">
          {t("users.temporaryPasswordEmailed")}
        </p>
        <Button size="sm" variant="outline" onClick={onClose}>
          {t("users.closeTemporaryPassword")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-b border-border/60 px-4 py-3">
      <p className="text-[13px] font-medium text-foreground">
        {t("users.temporaryPasswordTitle")}
      </p>
      <p className="text-[12px] text-muted-foreground">
        {t("users.temporaryPasswordHint")}
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded-md border border-border bg-elevated px-2 py-1.5 text-[12px]">
          {result.temporaryPassword}
        </code>
        <Button
          size="sm"
          variant="outline"
          type="button"
          aria-label={t("users.copyTemporaryPassword")}
          onClick={() => {
            if (result.temporaryPassword === null) {
              return;
            }
            void navigator.clipboard.writeText(result.temporaryPassword);
            setCopied(true);
          }}
        >
          <Copy size={14} />{" "}
          {copied ? t("users.copied") : t("users.copyTemporaryPassword")}
        </Button>
      </div>
      <Button size="sm" variant="outline" onClick={onClose}>
        {t("users.closeTemporaryPassword")}
      </Button>
    </div>
  );
}

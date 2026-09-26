import { ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MfaEnrollment } from "@/components/auth/mfa-enrollment";
import { RecoveryCodesPanel } from "@/components/auth/recovery-codes-panel";
import { MfaCodeDialog } from "@/components/account-security/mfa-code-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  confirmMfaSetup,
  disableMfa,
  regenerateRecoveryCodes,
  startMfaSetup,
  type MfaStatus,
} from "@/services/account-security-api";

interface MfaSectionProperties {
  readonly mfa: MfaStatus;
  readonly onChanged: () => void;
}

type Mode = "idle" | "enroll" | "codes";

/** Paket 2.1 (M1–M4): set up, regenerate recovery codes, disable. */
export function MfaSection({ mfa, onChanged }: MfaSectionProperties) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("idle");
  const [codes, setCodes] = useState<readonly string[]>([]);
  const [dialog, setDialog] = useState<"disable" | "regenerate" | null>(null);

  if (mfa.requirement === "unavailable" && !mfa.enabled) {
    return <p className="text-[12.5px] text-muted-foreground">{t("account.security.mfaUnavailable")}</p>;
  }

  if (mode === "enroll") {
    return (
      <div className="max-w-sm">
        <MfaEnrollment
          loadSecret={startMfaSetup}
          onConfirm={async (code) => {
            const result = await confirmMfaSetup(code);
            setCodes(result.recoveryCodes);
            setMode("codes");
          }}
          onCancel={() => setMode("idle")}
        />
      </div>
    );
  }

  if (mode === "codes") {
    return (
      <div className="max-w-sm">
        <RecoveryCodesPanel
          codes={codes}
          doneLabel={t("account.security.done")}
          onDone={() => {
            setCodes([]);
            setMode("idle");
            onChanged();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {mfa.enabled ? (
          <Badge tone="success" dot>
            {t("account.security.mfaOn")}
          </Badge>
        ) : (
          <Badge tone={mfa.requirement === "required" ? "danger" : "neutral"} dot>
            {t("account.security.mfaOff")}
          </Badge>
        )}
        {mfa.requirement === "required" ? <Badge tone="warning">{t("account.security.mfaRequired")}</Badge> : null}
      </div>
      {!mfa.serverConfigured ? (
        <p className="text-[12px] text-warning">{t("auth.mfa.serverNotConfigured")}</p>
      ) : null}
      {mfa.enabled ? (
        <>
          <p className="text-[12.5px] text-muted-foreground">
            {t("account.security.recoveryRemaining", { count: mfa.recoveryCodesRemaining })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDialog("regenerate")}>
              <ShieldCheck /> {t("account.security.regenerateCodes")}
            </Button>
            {mfa.requirement !== "required" ? (
              <Button type="button" variant="danger" size="sm" onClick={() => setDialog("disable")}>
                <ShieldOff /> {t("account.security.disableMfa")}
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className="text-[12.5px] leading-5 text-muted-foreground">{t("account.security.mfaIntro")}</p>
          <Button type="button" size="sm" disabled={!mfa.serverConfigured} onClick={() => setMode("enroll")}>
            <ShieldCheck /> {t("account.security.enableMfa")}
          </Button>
        </>
      )}
      <MfaCodeDialog
        open={dialog === "regenerate"}
        onOpenChange={(open) => setDialog(open ? "regenerate" : null)}
        title={t("account.security.regenerateCodes")}
        description={t("account.security.regenerateHint")}
        submitLabel={t("account.security.regenerateConfirm")}
        allowRecoveryCode={false}
        onSubmit={async (code) => {
          const result = await regenerateRecoveryCodes(code);
          setDialog(null);
          setCodes(result.recoveryCodes);
          setMode("codes");
        }}
      />
      <MfaCodeDialog
        open={dialog === "disable"}
        onOpenChange={(open) => setDialog(open ? "disable" : null)}
        title={t("account.security.disableMfa")}
        description={t("account.security.disableHint")}
        submitLabel={t("account.security.disableConfirm")}
        onSubmit={async (code) => {
          await disableMfa(code);
          setDialog(null);
          toast({ tone: "success", title: t("account.security.mfaDisabled") });
          onChanged();
        }}
      />
    </div>
  );
}

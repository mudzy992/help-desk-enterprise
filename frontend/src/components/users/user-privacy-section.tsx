import { Download, Lock, LockOpen, UserX } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LegalHoldDialog } from "@/components/privacy/privacy-legal-holds-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hintClassName } from "@/components/ui/control";
import { canOpenAdminArea, canOpenPrivacy } from "@/lib/session/route-access";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import type { UserSummary } from "@/services/users-api";

/**
 * Paket 2.6 (§11): privacy shortcuts on the user profile — export, erasure
 * (deactivated people only) and legal hold. Hidden without `privacy.view`.
 */
export function UserPrivacySection({ user, onChanged }: { readonly user: UserSummary; readonly onChanged: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const capabilities = useSessionCapabilities();
  const [holdMode, setHoldMode] = useState<"set" | "clear" | null>(null);
  if (!canOpenPrivacy(capabilities)) return null;

  const isSuperAdmin = capabilities.session?.isSuperAdmin === true;
  const canManage = isSuperAdmin || capabilities.hasPermission(permissionKeys.privacyManage);
  const canAnonymize = isSuperAdmin || capabilities.hasPermission(permissionKeys.privacyAnonymize);
  const canHold = canOpenAdminArea(capabilities);
  const anonymized = Boolean(user.anonymizedAt);
  const onHold = user.legalHold === true;

  return (
    <section data-testid="user-privacy-section">
      <h3 className="mb-3 text-[12px] font-medium text-foreground">{t("privacy.userSection.heading")}</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        {anonymized ? (
          <Badge tone="neutral">
            {t("privacy.userSection.anonymized", {
              date: new Date(user.anonymizedAt as string).toLocaleDateString(i18n.language),
            })}
          </Badge>
        ) : null}
        {onHold ? (
          <Badge tone="hold">
            <Lock size={10} aria-hidden="true" /> {t("privacy.markers.legalHold")}
          </Badge>
        ) : null}
        {!anonymized && !onHold ? <p className={hintClassName}>{t("privacy.userSection.none")}</p> : null}
      </div>
      {anonymized ? null : (
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/privacy?tab=exports&subject=${encodeURIComponent(user.id)}`)}
            >
              <Download size={14} /> {t("privacy.userSection.export")}
            </Button>
          ) : null}
          {canAnonymize && !user.isActive ? (
            <Button
              size="sm"
              variant="outline"
              disabled={onHold}
              onClick={() => navigate(`/privacy?tab=anonymization&user=${encodeURIComponent(user.id)}`)}
            >
              <UserX size={14} /> {t("privacy.userSection.anonymize")}
            </Button>
          ) : null}
          {canHold ? (
            <Button size="sm" variant="outline" onClick={() => setHoldMode(onHold ? "clear" : "set")} data-testid="user-legal-hold">
              {onHold ? <LockOpen size={14} /> : <Lock size={14} />}{" "}
              {onHold ? t("privacy.holds.clear") : t("privacy.holds.set")}
            </Button>
          ) : null}
        </div>
      )}
      {canAnonymize && user.isActive && !anonymized ? (
        <p className={`${hintClassName} mt-2`}>{t("privacy.userSection.deactivateFirst")}</p>
      ) : null}
      <LegalHoldDialog
        open={holdMode !== null}
        onOpenChange={(open) => !open && setHoldMode(null)}
        mode={holdMode ?? "set"}
        target="user"
        targetId={user.id}
        label={user.displayName}
        onDone={() => void onChanged()}
      />
    </section>
  );
}

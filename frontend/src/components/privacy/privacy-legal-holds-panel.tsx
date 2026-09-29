import { Lock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  hintClassName,
  sectionTitleClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalTitle } from "@/components/ui/modal";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { localizePersonName } from "@/lib/privacy/privacy-view";
import {
  clearLegalHold,
  listLegalHolds,
  setLegalHold,
  type LegalHold,
  type LegalHoldTarget,
} from "@/services/privacy-api";
import { PanelIntro, PersonPicker, useDateFormat, usePrivacyFailure, useUserDirectory } from "./privacy-shared";
import { ScrollRegion } from "@/components/ui/scroll-region";

interface LegalHoldDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mode: "set" | "clear";
  readonly target: LegalHoldTarget;
  /** Ticket number / id or user id. */
  readonly targetId: string;
  readonly label: string;
  readonly onDone: () => void;
}

/** §7.4: setting and lifting a hold both need a reason (≥ 10 characters, audited). */
export function LegalHoldDialog({ open, onOpenChange, mode, target, targetId, label, onDone }: LegalHoldDialogProperties) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fail = usePrivacyFailure();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "set") await setLegalHold(target, targetId, reason.trim());
      else await clearLegalHold(target, targetId, reason.trim());
      toast({ title: mode === "set" ? t("privacy.holds.setToast") : t("privacy.holds.clearedToast"), tone: "success" });
      onOpenChange(false);
      onDone();
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent data-testid="privacy-hold-dialog">
        <ModalTitle className="pr-6 text-[14px] font-semibold leading-5 text-foreground">
          {mode === "set" ? t("privacy.holds.setTitle", { label }) : t("privacy.holds.clearTitle", { label })}
        </ModalTitle>
        <ModalDescription className="mb-3 mt-1 text-[12.5px] leading-5 text-muted-foreground">
          {mode === "set" ? t("privacy.holds.setBody") : t("privacy.holds.clearBody")}
        </ModalDescription>
        <Field label={t("privacy.holds.reason")} hint={t("privacy.common.minChars", { count: 10 })} required>
          <Textarea
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            data-testid="privacy-hold-reason"
          />
        </Field>
        <ModalFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            {t("ui.cancel")}
          </Button>
          <Button
            size="sm"
            variant={mode === "set" ? "primary" : "danger"}
            disabled={busy || reason.trim().length < 10}
            onClick={() => void submit()}
            data-testid="privacy-hold-confirm"
          >
            {mode === "set" ? t("privacy.holds.set") : t("privacy.holds.clear")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/** Paket 2.6 (§7.4, §11): ADMIN and SUPER_ADMIN place and lift holds; retention and anonymization skip them. */
export function PrivacyLegalHoldsPanel({ canChange }: { readonly canChange: boolean }) {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const users = useUserDirectory(canChange);
  const [holds, setHolds] = useState<readonly LegalHold[] | null>(null);
  const [loadError, setLoadError] = useState<{ key: ApiErrorKey; requestId: string | null } | null>(null);
  const [target, setTarget] = useState<LegalHoldTarget>("ticket");
  const [ticketNumber, setTicketNumber] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ mode: "set" | "clear"; target: LegalHoldTarget; id: string; label: string } | null>(
    null,
  );

  const reload = useCallback(async () => {
    try {
      setHolds(await listLegalHolds());
      setLoadError(null);
    } catch (caught) {
      setLoadError({ key: mapApiError(caught), requestId: readApiRequestId(caught) });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loadError !== null) return <ApiErrorText messageKey={loadError.key} requestId={loadError.requestId} />;
  if (holds === null) return <PanelSkeleton className="mt-0" label={t("privacy.tabs.holds")} />;

  const selectedUser = users?.find((user) => user.id === userId) ?? null;
  const newTarget =
    target === "ticket"
      ? ticketNumber.trim().length > 0
        ? { id: ticketNumber.trim(), label: ticketNumber.trim() }
        : null
      : selectedUser !== null
        ? { id: selectedUser.id, label: selectedUser.displayName }
        : null;

  return (
    <div className="flex flex-col gap-6" data-testid="privacy-holds">
      <PanelIntro>{t("privacy.holds.intro")}</PanelIntro>

      {canChange ? (
        <Card className="flex max-w-2xl flex-col gap-3 p-4">
          <h2 className={sectionTitleClassName}>{t("privacy.holds.newTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <Field label={t("privacy.holds.target")}>
              <Select value={target} onChange={(event) => setTarget(event.target.value as LegalHoldTarget)}>
                <option value="ticket">{t("privacy.holds.targetTicket")}</option>
                <option value="user">{t("privacy.holds.targetUser")}</option>
              </Select>
            </Field>
            {target === "ticket" ? (
              <Field label={t("privacy.holds.ticketNumber")} hint={t("privacy.holds.ticketNumberHint")}>
                <Input
                  value={ticketNumber}
                  maxLength={40}
                  onChange={(event) => setTicketNumber(event.target.value)}
                  data-testid="privacy-hold-ticket"
                />
              </Field>
            ) : (
              <div>
                <p className="mb-1.5 text-[12.5px] font-medium text-foreground">{t("privacy.holds.targetUser")}</p>
                <PersonPicker
                  id="privacy-hold-user"
                  users={users}
                  value={userId}
                  filter={(user) => !user.anonymizedAt && !user.legalHold}
                  onChange={(user) => setUserId(user?.id ?? null)}
                />
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={newTarget === null}
              onClick={() => newTarget !== null && setDialog({ mode: "set", target, ...newTarget })}
              data-testid="privacy-hold-new"
            >
              <Lock size={14} /> {t("privacy.holds.set")}
            </Button>
          </div>
        </Card>
      ) : null}

      {holds.length === 0 ? (
        <EmptyState
          icon={<Lock size={18} strokeWidth={1.8} />}
          title={t("privacy.holds.emptyTitle")}
          body={t("privacy.holds.emptyBody")}
        />
      ) : (
        <ScrollRegion className={tableWrapClassName}>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className={`${tableHeadClassName} border-b border-border/70`}>
                <th className="px-3 py-2 text-left">{t("privacy.holds.target")}</th>
                <th className="px-3 py-2 text-left">{t("privacy.holds.label")}</th>
                <th className="px-3 py-2 text-left">{t("privacy.holds.reason")}</th>
                <th className="px-3 py-2 text-left">{t("privacy.holds.since")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {holds.map((hold) => (
                <tr key={`${hold.target}:${hold.id}`} className={tableRowClassName} data-testid="privacy-hold-row">
                  <td className="px-3 text-muted-foreground">
                    {hold.target === "ticket" ? t("privacy.holds.targetTicket") : t("privacy.holds.targetUser")}
                  </td>
                  <td className="px-3 font-medium text-foreground">
                    {hold.target === "ticket" ? (
                      <Link className="text-link hover:underline" to={`/tickets/${encodeURIComponent(hold.id)}`}>
                        {hold.label}
                      </Link>
                    ) : (
                      localizePersonName(hold.label, i18n.language)
                    )}
                  </td>
                  <td className="max-w-[360px] px-3 text-muted-foreground">
                    <span className="line-clamp-2">{hold.reason ?? "—"}</span>
                  </td>
                  <td className="px-3 text-muted-foreground">{format.date(hold.heldAt)}</td>
                  <td className="px-2 text-right">
                    {canChange ? (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => setDialog({ mode: "clear", target: hold.target, id: hold.id, label: hold.label })}
                      >
                        {t("privacy.holds.clear")}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
      <p className={hintClassName}>{t("privacy.holds.effectHint")}</p>

      <LegalHoldDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        mode={dialog?.mode ?? "set"}
        target={dialog?.target ?? "ticket"}
        targetId={dialog?.id ?? ""}
        label={dialog === null ? "" : localizePersonName(dialog.label, i18n.language)}
        onDone={() => {
          setTicketNumber("");
          setUserId(null);
          void reload();
        }}
      />
    </div>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { mapApiError } from "@/lib/map-api-error";
import { fromDateTimeLocalValue, mapOnCallError, toDateTimeLocalValue } from "@/lib/on-call/on-call-view";
import { createOnCallOverride, requestOnCallSwap } from "@/services/on-call-api";

export type OnCallRangeMode = "override" | "swap";

interface OnCallRangeDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mode: OnCallRangeMode;
  readonly groupId: string;
  readonly groupName: string;
  /** Who can take the shift: candidates (override) or rotation colleagues (swap). */
  readonly people: ReadonlyArray<{ readonly userId: string; readonly displayName: string }>;
  readonly initialRange?: { readonly startsAt: string; readonly endsAt: string };
  readonly onSaved: () => void;
}

/**
 * Paket 2.9 (K3, §4.1/§4.4): a manager's override, or an agent's swap
 * request to a rotation colleague (the colleague confirms before anything
 * changes). Times are entered in the browser's zone and sent as instants.
 */
export function OnCallRangeDialog({
  open,
  onOpenChange,
  mode,
  groupId,
  groupName,
  people,
  initialRange,
  onSaved,
}: OnCallRangeDialogProperties) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const start = initialRange ? new Date(initialRange.startsAt) : new Date(Date.now() + 3_600_000);
    const end = initialRange ? new Date(initialRange.endsAt) : new Date(start.getTime() + 86_400_000);
    setUserId("");
    setStartsAt(toDateTimeLocalValue(start));
    setEndsAt(toDateTimeLocalValue(end));
    setReason("");
    setError(null);
  }, [open, initialRange]);

  const startIso = fromDateTimeLocalValue(startsAt);
  const endIso = fromDateTimeLocalValue(endsAt);
  const orderError = startIso !== null && endIso !== null && Date.parse(endIso) <= Date.parse(startIso);
  const valid = userId !== "" && startIso !== null && endIso !== null && !orderError && reason.trim().length >= 3;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || saving || startIso === null || endIso === null) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === "override") {
        await createOnCallOverride(groupId, { userId, startsAt: startIso, endsAt: endIso, reason: reason.trim() });
        toast({ tone: "success", title: t("onCall.override.saved") });
      } else {
        await requestOnCallSwap(groupId, { colleagueId: userId, startsAt: startIso, endsAt: endIso, reason: reason.trim() });
        toast({ tone: "success", title: t("onCall.swap.requested") });
      }
      onOpenChange(false);
      onSaved();
    } catch (caught) {
      setError(t(mapOnCallError(caught) ?? mapApiError(caught)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <ModalContent className="max-w-lg">
        <ModalHeader
          title={mode === "override" ? t("onCall.override.title") : t("onCall.swap.title")}
          description={mode === "override" ? groupName : t("onCall.swap.description", { group: groupName })}
        />
        <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
          <Field label={mode === "override" ? t("onCall.override.person") : t("onCall.swap.colleague")} required>
            <Select value={userId} onChange={(event) => setUserId(event.target.value)}>
              <option value="">{t("onCall.schedule.pick")}</option>
              {people.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("onCall.from")} required>
              <Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
            </Field>
            <Field label={t("onCall.to")} required error={orderError ? t("onCall.errors.order") : null}>
              <Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
            </Field>
          </div>
          <Field label={t("onCall.reason")} required hint={mode === "swap" ? t("onCall.swap.reasonHint") : t("onCall.reasonHint")}>
            <Textarea rows={2} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
          </Field>
          {error ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              {t("ui.cancel")}
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving ? t("onCall.saving") : mode === "override" ? t("onCall.override.save") : t("onCall.swap.send")}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

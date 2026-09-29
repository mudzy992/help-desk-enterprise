import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { mapApiError } from "@/lib/map-api-error";
import { mapOnCallError, moveItem } from "@/lib/on-call/on-call-view";
import {
  saveOnCallSchedule,
  type OnCallGroupDetail,
  type OnCallRotationLength,
} from "@/services/on-call-api";

interface OnCallScheduleDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly detail: OnCallGroupDetail;
  readonly onSaved: () => void;
}

const handoffOptions = Array.from({ length: 96 }, (_, index) => {
  const minute = index * 15;
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
});

function todayCivil(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type Member = { readonly userId: string; readonly displayName: string; readonly isAvailable: boolean };

/**
 * Paket 2.9 (K3, §4.4): rotation settings and member order. Reordering uses
 * explicit up/down buttons (keyboard and screen-reader friendly, no drag).
 */
export function OnCallScheduleDialog({ open, onOpenChange, detail, onSaved }: OnCallScheduleDialogProperties) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const schedule = detail.schedule;
  const [timezone, setTimezone] = useState("");
  const [handoffTime, setHandoffTime] = useState("08:00");
  const [rotationLength, setRotationLength] = useState<OnCallRotationLength>("WEEK");
  const [rotationStartDate, setRotationStartDate] = useState(todayCivil());
  const [isActive, setIsActive] = useState(true);
  const [autoAssign, setAutoAssign] = useState(false);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [addUserId, setAddUserId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTimezone(schedule?.timezone ?? detail.defaultTimezone);
    setHandoffTime(schedule?.handoffTime ?? "08:00");
    setRotationLength(schedule?.rotationLength ?? "WEEK");
    setRotationStartDate(schedule?.rotationStartDate ?? todayCivil());
    setIsActive(schedule?.isActive ?? true);
    setAutoAssign(schedule?.autoAssignOutsideHours ?? false);
    setOwnerUserId(schedule?.owner?.userId ?? "");
    setMembers(
      schedule?.members.map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        isAvailable: member.isAvailable,
      })) ?? [],
    );
    setAddUserId("");
    setReason("");
    setError(null);
  }, [open, schedule, detail.defaultTimezone]);

  const memberIds = new Set(members.map((member) => member.userId));
  const addable = detail.candidates.filter((candidate) => !memberIds.has(candidate.userId));
  const ownerOptions = [
    ...detail.candidates,
    ...(schedule?.owner && !detail.candidates.some((candidate) => candidate.userId === schedule.owner?.userId)
      ? [{ userId: schedule.owner.userId, displayName: schedule.owner.displayName }]
      : []),
  ];

  const addMember = () => {
    const candidate = detail.candidates.find((item) => item.userId === addUserId);
    if (candidate === undefined) return;
    setMembers((current) => [...current, { ...candidate, isAvailable: true }]);
    setAddUserId("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || reason.trim().length < 3) return;
    setSaving(true);
    setError(null);
    try {
      await saveOnCallSchedule(detail.group.id, {
        timezone: timezone.trim(),
        handoffTime,
        rotationLength,
        rotationStartDate,
        isActive,
        autoAssignOutsideHours: autoAssign,
        ownerUserId: ownerUserId === "" ? null : ownerUserId,
        memberUserIds: members.map((member) => member.userId),
        reason: reason.trim(),
      });
      toast({ tone: "success", title: t("onCall.schedule.saved") });
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
      <ModalContent className="max-w-2xl">
        <ModalHeader
          title={schedule === null ? t("onCall.schedule.createTitle") : t("onCall.schedule.editTitle")}
          description={detail.group.name}
        />
        <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("onCall.schedule.rotationLength")} required>
              <Select value={rotationLength} onChange={(event) => setRotationLength(event.target.value as OnCallRotationLength)}>
                <option value="WEEK">{t("onCall.schedule.week")}</option>
                <option value="DAY">{t("onCall.schedule.day")}</option>
              </Select>
            </Field>
            <Field label={t("onCall.schedule.handoffTime")} required hint={t("onCall.schedule.handoffHint")}>
              <Select value={handoffTime} onChange={(event) => setHandoffTime(event.target.value)}>
                {handoffOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("onCall.schedule.startDate")} required hint={t("onCall.schedule.startDateHint")}>
              <Input type="date" value={rotationStartDate} onChange={(event) => setRotationStartDate(event.target.value)} required />
            </Field>
            <Field label={t("onCall.schedule.timezone")} required hint={t("onCall.schedule.timezoneHint")}>
              <Input value={timezone} maxLength={64} onChange={(event) => setTimezone(event.target.value)} required />
            </Field>
            <Field label={t("onCall.schedule.owner")} hint={t("onCall.schedule.ownerHint")} className="sm:col-span-2">
              <Select value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)}>
                <option value="">{t("onCall.schedule.ownerMe")}</option>
                {ownerOptions.map((candidate) => (
                  <option key={candidate.userId} value={candidate.userId}>
                    {candidate.displayName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset className="grid gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-[12.5px] font-semibold text-foreground">{t("onCall.schedule.members")}</legend>
            <p className={hintClassName}>{t("onCall.schedule.membersHint")}</p>
            {members.length === 0 ? (
              <p className={hintClassName}>{t("onCall.schedule.noMembers")}</p>
            ) : (
              <ol className="grid gap-1.5">
                {members.map((member, index) => (
                  <li
                    key={member.userId}
                    className="flex items-center gap-2 rounded-md border border-border/70 bg-background/40 px-2.5 py-1.5 text-[12.5px]"
                  >
                    <span className="w-5 text-right tabular-nums text-muted-foreground">{index + 1}.</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {member.displayName}
                      {member.isAvailable ? null : (
                        <span className="ml-2 text-[11.5px] text-warning">{t("onCall.unavailable")}</span>
                      )}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t("onCall.schedule.moveUp", { name: member.displayName })}
                      disabled={index === 0}
                      onClick={() => setMembers((current) => moveItem(current, index, -1))}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t("onCall.schedule.moveDown", { name: member.displayName })}
                      disabled={index === members.length - 1}
                      onClick={() => setMembers((current) => moveItem(current, index, 1))}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t("onCall.schedule.remove", { name: member.displayName })}
                      onClick={() => setMembers((current) => current.filter((item) => item.userId !== member.userId))}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <Field label={t("onCall.schedule.addMember")} className="min-w-[220px] flex-1">
                <Select value={addUserId} onChange={(event) => setAddUserId(event.target.value)} disabled={addable.length === 0}>
                  <option value="">{addable.length === 0 ? t("onCall.schedule.noCandidates") : t("onCall.schedule.pick")}</option>
                  {addable.map((candidate) => (
                    <option key={candidate.userId} value={candidate.userId}>
                      {candidate.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="button" variant="outline" size="sm" onClick={addMember} disabled={addUserId === ""}>
                <Plus />
                {t("onCall.schedule.add")}
              </Button>
            </div>
          </fieldset>

          <div className="grid gap-3">
            <Checkbox
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              label={<span className="text-[12.5px] font-medium text-foreground">{t("onCall.schedule.active")}</span>}
            />
            <div className="grid gap-1">
              <Checkbox
                checked={autoAssign}
                onChange={(event) => setAutoAssign(event.target.checked)}
                label={<span className="text-[12.5px] font-medium text-foreground">{t("onCall.schedule.autoAssign")}</span>}
              />
              <span className={`pl-6 ${hintClassName}`}>{t("onCall.schedule.autoAssignHint")}</span>
            </div>
          </div>

          <Field label={t("onCall.reason")} required hint={t("onCall.reasonHint")}>
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
            <Button type="submit" disabled={saving || reason.trim().length < 3}>
              {saving ? t("onCall.saving") : t("onCall.schedule.save")}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

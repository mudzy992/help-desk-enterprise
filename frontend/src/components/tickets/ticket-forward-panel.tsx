import { useEffect, useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  errorTextClassName,
  hintClassName,
  labelClassName,
  selectClassName,
  textareaClassName,
} from "@/components/ui/control";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import {
  findPreviousGroup,
  forwardReasonError,
  orderForwardTargets,
} from "@/lib/tickets/ticket-forwarding";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { TicketResponse } from "@/services/tickets-api";
import {
  forwardTicket,
  listForwardTargetAgents,
  listForwardTargets,
  type ForwardTargetAgent,
  type ForwardTargetGroup,
  type ForwardTargetsResponse,
} from "@/services/tickets-forwarding-api";

interface TicketForwardPanelProperties {
  readonly ticket: TicketResponse;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onComplete: (ticket: TicketResponse) => void;
}

function groupLabel(group: ForwardTargetGroup): string {
  return group.organizationalUnitName === null
    ? group.name
    : `${group.name} — ${group.organizationalUnitName}`;
}

/**
 * Package 1.1: forward (escalate) a ticket to another group, possibly in
 * another OU. The server lists only groups the actor may use, so the dialog
 * never offers a target that would be refused for OU reasons.
 */
export function TicketForwardPanel({
  ticket,
  open,
  onOpenChange,
  onComplete,
}: TicketForwardPanelProperties) {
  const { t } = useTranslation();
  const [targets, setTargets] = useState<ForwardTargetsResponse | null>(null);
  const [loadError, setLoadError] = useState<TicketErrorKey | null>(null);
  const [groupId, setGroupId] = useState("");
  const [agents, setAgents] = useState<readonly ForwardTargetAgent[]>([]);
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [keepMeAsWatcher, setKeepMeAsWatcher] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<TicketErrorKey | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    setTargets(null);
    setLoadError(null);
    setSubmitError(null);
    setGroupId("");
    setUserId("");
    setReason("");
    setKeepMeAsWatcher(false);
    listForwardTargets(ticket.id)
      .then((response) => {
        if (!active) {
          return;
        }
        setTargets(response);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(mapTicketError(error));
        }
      });
    return () => {
      active = false;
    };
  }, [open, ticket.id]);

  useEffect(() => {
    setAgents([]);
    setUserId("");
    if (!open || groupId.length === 0) {
      return;
    }
    let active = true;
    listForwardTargetAgents(ticket.id, groupId)
      .then((response) => {
        if (active) {
          setAgents(response);
        }
      })
      // The agent is optional; without the list the forward still works.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [open, groupId, ticket.id]);

  const ordered = useMemo(
    () => (targets === null ? [] : orderForwardTargets(targets)),
    [targets],
  );
  const sameOu = ordered.filter((group) => !group.isCrossOu);
  const otherOu = ordered.filter((group) => group.isCrossOu);
  const selected = ordered.find((group) => group.id === groupId) ?? null;
  const previous = findPreviousGroup(targets);
  const reasonInvalid = targets !== null && forwardReasonError(reason, targets);
  const canSubmit = !busy && selected !== null && !reasonInvalid;

  const submit = () => {
    if (selected === null) {
      return;
    }
    setBusy(true);
    setSubmitError(null);
    void forwardTicket(ticket.id, {
      targetGroupId: selected.id,
      ...(userId.length > 0 ? { targetUserId: userId } : {}),
      reason: reason.trim(),
      keepMeAsWatcher,
    })
      .then((updated) => {
        onOpenChange(false);
        onComplete(updated);
      })
      .catch((error: unknown) => setSubmitError(mapTicketError(error)))
      .finally(() => setBusy(false));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>{t("tickets.forward.title")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("tickets.forward.hint")}
        </SheetDescription>
        {ticket.assignedGroupName ? (
          <p className="mt-3 text-[12px] text-muted-foreground">
            {t("tickets.forward.currentGroup")}:{" "}
            <span className="font-medium text-foreground">{ticket.assignedGroupName}</span>
          </p>
        ) : null}
        {loadError !== null ? (
          <p className={`mt-4 ${errorTextClassName}`} role="alert">
            {ticketText(t, loadError)}
          </p>
        ) : targets === null ? (
          <p className={`mt-4 ${hintClassName}`}>{t("tickets.forward.loading")}</p>
        ) : (
          <>
            {previous !== null && previous.id !== groupId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-4 self-start"
                onClick={() => setGroupId(previous.id)}
              >
                <Undo2 size={14} />
                {ticketText(t, "tickets.forward.handBackTo", { name: previous.name })}
              </Button>
            ) : null}
            <label className={`mt-4 ${labelClassName}`}>
              {t("tickets.forward.targetGroup")}
              <select
                className={selectClassName}
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
                data-testid="forward-target-group"
              >
                <option value="">{t("tickets.forward.targetGroupPlaceholder")}</option>
                {sameOu.length > 0 ? (
                  <optgroup label={t("tickets.forward.sameOu")}>
                    {sameOu.map((group) => (
                      <option key={group.id} value={group.id}>
                        {groupLabel(group)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {otherOu.length > 0 ? (
                  <optgroup label={t("tickets.forward.otherOu")}>
                    {otherOu.map((group) => (
                      <option key={group.id} value={group.id}>
                        {groupLabel(group)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
            {ordered.length === 0 ? (
              <p className={`mt-2 ${hintClassName}`}>{t("tickets.forward.noTargets")}</p>
            ) : !targets.crossOuAllowed ? (
              <p className={`mt-2 ${hintClassName}`}>{t("tickets.forward.crossOuUnavailable")}</p>
            ) : null}
            {ticket.isConfidential && selected !== null ? (
              <p className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-foreground">
                {t("tickets.forward.confidentialNotice")}
              </p>
            ) : null}
            {selected?.isCrossOu ? (
              <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-foreground">
                {ticketText(t, "tickets.forward.crossOuNotice", {
                  unit: selected.organizationalUnitName ?? "—",
                })}
              </p>
            ) : null}
            {selected !== null ? (
              <label className={`mt-3 ${labelClassName}`}>
                {t("tickets.forward.targetAgent")}
                <select
                  className={selectClassName}
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                >
                  <option value="">{t("tickets.forward.targetAgentNone")}</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.displayName}
                    </option>
                  ))}
                </select>
                <span className={hintClassName}>{t("tickets.forward.targetAgentHint")}</span>
              </label>
            ) : null}
            <label className={`mt-3 ${labelClassName}`}>
              {targets.requireReason
                ? t("tickets.forward.reasonRequired")
                : t("tickets.forward.reason")}
              <textarea
                className={textareaClassName}
                value={reason}
                maxLength={1000}
                onChange={(event) => setReason(event.target.value)}
                data-testid="forward-reason"
              />
              {targets.requireReason ? (
                <span className={hintClassName}>
                  {ticketText(t, "tickets.forward.reasonHint", {
                    count: targets.minReasonLength,
                  })}
                </span>
              ) : null}
            </label>
            <div className="mt-3">
              <Checkbox
                checked={keepMeAsWatcher}
                onChange={(event) => setKeepMeAsWatcher(event.target.checked)}
                label={t("tickets.forward.keepMeAsWatcher")}
              />
            </div>
            <p className={`mt-3 ${hintClassName}`}>{t("tickets.forward.effects")}</p>
          </>
        )}
        {submitError !== null ? (
          <p className={`mt-3 ${errorTextClassName}`} role="alert">
            {ticketText(t, submitError)}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2 border-t border-border/70 pt-4">
          <Button type="button" size="sm" disabled={!canSubmit} onClick={submit}>
            {busy ? t("tickets.forward.forwarding") : t("tickets.forward.submit")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("tickets.detail.cancelStatus")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

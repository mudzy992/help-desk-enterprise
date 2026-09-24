import { Check, CheckCheck, Clock3, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { textareaClassName } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/relative-time";
import { pickName } from "@/lib/tickets/ticket-names";
import { ticketText } from "@/lib/tickets/ticket-text";
import { cn } from "@/lib/utils";
import type { TicketApprovalResponse } from "@/services/tickets-approvals-api";

interface TicketApprovalsPanelProperties {
  readonly items: readonly TicketApprovalResponse[];
  readonly visible: boolean;
  readonly isSaving: boolean;
  readonly authorNames: ReadonlyMap<string, string>;
  readonly onApprove: (approvalId: string, comment: string) => Promise<unknown>;
  readonly onReject: (approvalId: string, comment: string) => Promise<unknown>;
}

export function TicketApprovalsPanel({
  items,
  visible,
  isSaving,
  authorNames,
  onApprove,
  onReject,
}: TicketApprovalsPanelProperties) {
  const { t, i18n } = useTranslation();
  const [comment, setComment] = useState("");
  if (!visible || items.length === 0) {
    return null;
  }
  const done = items.filter((item) => item.status === "APPROVED").length;
  const pending = items.find((item) => item.status === "PENDING" && item.canDecide);

  const decide = async (action: "approve" | "reject") => {
    if (pending === undefined || comment.trim().length === 0) {
      return;
    }
    const run = action === "approve" ? onApprove : onReject;
    await run(pending.id, comment.trim());
    setComment("");
  };

  return (
    <Card className="fade-in">
      <CardHeader
        title={t("tickets.detail.approvals")}
        subtitle={`${done} / ${items.length}`}
      />
      <ul className="space-y-0 px-4 py-3">
        {items.map((item, index) => {
          const name =
            item.approverUserId === null
              ? null
              : (pickName(authorNames.get(item.approverUserId)) ??
                t("tickets.detail.unknownUser"));
          return (
            <li key={item.id} className="relative flex gap-3 pb-4 last:pb-1">
              {index < items.length - 1 ? (
                <span className="absolute left-[13px] top-7 h-[calc(100%-18px)] w-px bg-border" />
              ) : null}
              <span
                className={cn(
                  "z-10 flex size-7 shrink-0 items-center justify-center rounded-full border",
                  item.status === "APPROVED" && "border-success/40 bg-success/15 text-ok",
                  item.status === "PENDING" && "border-warning/40 bg-warning/10 text-warning",
                  item.status === "REJECTED" && "border-danger/40 bg-danger/10 text-danger",
                )}
              >
                {item.status === "APPROVED" ? (
                  <CheckCheck size={13} />
                ) : item.status === "PENDING" ? (
                  <Clock3 size={13} />
                ) : (
                  <X size={13} />
                )}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[12.5px] font-medium text-foreground/90">
                  {ticketText(t, "tickets.detail.approvalStep", { step: item.stepOrder })}
                </p>
                <p className="text-[11.5px] text-muted-foreground">
                  {name ?? "—"} ·{" "}
                  {item.status === "APPROVED" && item.decidedAt
                    ? <RelativeTime value={item.decidedAt} locale={i18n.language} />
                    : item.status === "PENDING"
                      ? t("tickets.detail.pendingDecision")
                      : ticketText(
                          t,
                          item.status === "APPROVED"
                            ? "tickets.approvalStatus.APPROVED"
                            : "tickets.approvalStatus.REJECTED",
                        )}
                </p>
                {item.comment ? (
                  <p className="mt-1 rounded-md bg-elevated/70 px-2 py-1 text-[11px] italic text-muted-foreground">
                    “{item.comment}”
                  </p>
                ) : null}
                {pending?.id === item.id ? (
                  <div className="mt-2 grid gap-2">
                    <textarea
                      className={cn(textareaClassName, "min-h-[72px]")}
                      value={comment}
                      disabled={isSaving}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder={t("tickets.detail.approvalComment")}
                    />
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        size="xs"
                        disabled={isSaving || comment.trim().length === 0}
                        onClick={() => void decide("approve")}
                      >
                        <Check size={11} /> {t("tickets.detail.approve")}
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="destructive"
                        disabled={isSaving || comment.trim().length === 0}
                        onClick={() => void decide("reject")}
                      >
                        <X size={11} /> {t("tickets.detail.reject")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

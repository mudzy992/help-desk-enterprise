import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { labelClassName, textareaClassName } from "@/components/ui/control";
import type { TicketApprovalResponse } from "@/services/tickets-approvals-api";

interface TicketApprovalsPanelProperties {
  readonly items: readonly TicketApprovalResponse[];
  readonly visible: boolean;
  readonly isSaving: boolean;
  readonly onApprove: (approvalId: string, comment: string) => Promise<unknown>;
  readonly onReject: (approvalId: string, comment: string) => Promise<unknown>;
}

export function TicketApprovalsPanel({
  items,
  visible,
  isSaving,
  onApprove,
  onReject,
}: TicketApprovalsPanelProperties) {
  const { t } = useTranslation();
  const [comment, setComment] = useState("");
  if (!visible || items.length === 0) {
    return null;
  }
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
    <Card className="grid gap-2 px-4 py-3.5">
      <h3 className="text-[13.5px] font-semibold text-foreground">{t("tickets.detail.approvals")}</h3>
      <ul className="grid gap-3">
        {items.map((item) => {
          const tone =
            item.status === "APPROVED"
              ? "bg-success"
              : item.status === "REJECTED"
                ? "bg-danger"
                : "bg-warning";
          return (
          <li
            key={item.id}
            className="relative border-l border-border/70 pl-3 text-[12.5px] text-foreground"
          >
            <span className={`absolute -left-1 top-1.5 size-2 rounded-full ${tone}`} />
            {t(`tickets.approvalStatus.${item.status}`)}
            {item.comment ? ` · ${item.comment}` : ""}
          </li>
          );
        })}
      </ul>
      {pending === undefined ? null : (
        <div className="grid gap-2">
          <label className={labelClassName}>
            {t("tickets.detail.approvalComment")}
            <textarea
              className={textareaClassName}
              value={comment}
              disabled={isSaving}
              onChange={(event) => setComment(event.target.value)}
              required
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isSaving || comment.trim().length === 0}
              onClick={() => void decide("approve")}
            >
              {isSaving ? t("tickets.detail.deciding") : t("tickets.detail.approve")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={isSaving || comment.trim().length === 0}
              onClick={() => void decide("reject")}
            >
              {t("tickets.detail.reject")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

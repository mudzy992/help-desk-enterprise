import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import type { TicketAttachmentResponse } from "@/services/tickets-attachments-api";

interface TicketAttachmentsPanelProperties {
  readonly items: readonly TicketAttachmentResponse[];
  readonly visible: boolean;
  readonly canUpload: boolean;
  readonly onUpload: (file: File) => Promise<void>;
  readonly onDownload: (attachment: TicketAttachmentResponse) => Promise<void>;
  readonly onDelete: (attachmentId: string) => Promise<void>;
}

export function TicketAttachmentsPanel({
  items,
  visible,
  canUpload,
  onUpload,
  onDownload,
  onDelete,
}: TicketAttachmentsPanelProperties) {
  const { t, i18n } = useTranslation();
  const inputReference = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  if (!visible) {
    return null;
  }
  return (
    <Card className="grid gap-2 px-4 py-3.5">
      <h3 className="text-[13.5px] font-semibold text-foreground">{t("tickets.detail.attachments")}</h3>
      {items.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{t("tickets.detail.noAttachments")}</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-body">
                {item.originalName}
                <span className="ml-2 text-[12px] text-muted-foreground tnum">
                  {formatTicketTimestamp(item.createdAt, i18n.language)}
                </span>
              </span>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => void onDownload(item)}>
                  {t("tickets.detail.download")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(t("tickets.detail.confirmDeleteAttachment"))) {
                      void onDelete(item.id);
                    }
                  }}
                >
                  {t("tickets.detail.deleteAttachment")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canUpload ? (
        <div>
          <input
            ref={inputReference}
            className="sr-only"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file === undefined) {
                return;
              }
              setIsUploading(true);
              void onUpload(file).finally(() => {
                setIsUploading(false);
                event.target.value = "";
              });
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isUploading}
            onClick={() => inputReference.current?.click()}
          >
            {t("tickets.detail.upload")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

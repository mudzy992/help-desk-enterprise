import { FileText, Image as ImageIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/relative-time";
import { formatByteSize } from "@/lib/tickets/ticket-display";
import type { TicketAttachmentResponse } from "@/services/tickets-attachments-api";

interface TicketAttachmentsPanelProperties {
  readonly items: readonly TicketAttachmentResponse[];
  readonly visible: boolean;
  readonly canUpload: boolean;
  readonly onUpload: (file: File) => Promise<void>;
  readonly onDownload: (attachment: TicketAttachmentResponse) => Promise<void>;
  readonly onDelete: (attachmentId: string) => Promise<void>;
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
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
    <Card>
      <CardHeader
        title={t("tickets.detail.attachments")}
        subtitle={t("tickets.detail.attachHint")}
        actions={
          canUpload ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={isUploading}
              onClick={() => inputReference.current?.click()}
            >
              {t("tickets.detail.upload")}
            </Button>
          ) : null
        }
      />
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
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
          {t("tickets.detail.noAttachments")}
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-elevated/40"
            >
              <span className="flex size-9 items-center justify-center rounded-md border border-border bg-elevated text-muted-foreground">
                {isImage(item.mimeType) ? <ImageIcon size={15} /> : <FileText size={15} />}
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => void onDownload(item)}
              >
                <p className="truncate text-[12.5px] font-medium text-foreground/90">
                  {item.originalName}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  <span className="tnum">{formatByteSize(item.sizeBytes)}</span>
                  {" · "}
                  <RelativeTime value={item.createdAt} locale={i18n.language} />
                </p>
              </button>
              <Badge tone={item.classification === "CONFIDENTIAL" ? "warning" : "neutral"} dot={false}>
                {item.classification}
              </Badge>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => {
                  if (window.confirm(t("tickets.detail.confirmDeleteAttachment"))) {
                    void onDelete(item.id);
                  }
                }}
              >
                {t("tickets.detail.deleteAttachment")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

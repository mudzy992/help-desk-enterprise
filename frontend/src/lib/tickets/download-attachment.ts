import type { TicketAttachmentResponse } from "@/services/tickets-attachments-api";
import { downloadTicketAttachment } from "@/services/tickets-attachments-api";

export async function downloadAttachmentFile(
  ticketId: string,
  attachment: TicketAttachmentResponse,
): Promise<void> {
  const blob = await downloadTicketAttachment(ticketId, attachment.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.originalName;
  link.click();
  URL.revokeObjectURL(url);
}

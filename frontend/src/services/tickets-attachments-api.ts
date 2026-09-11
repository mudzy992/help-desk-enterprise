import { apiBlobRequest, apiRequest } from "@/services/api";

export type TicketAttachmentResponse = {
  readonly id: string;
  readonly ticketId: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly extension: string;
  readonly sizeBytes: number;
  readonly classification: string;
  readonly uploadedByUserId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export function listTicketAttachments(
  ticketId: string,
): Promise<readonly TicketAttachmentResponse[]> {
  return apiRequest(`/tickets/${ticketId}/attachments`);
}

export function uploadTicketAttachment(
  ticketId: string,
  file: File,
  classification?: string,
): Promise<TicketAttachmentResponse> {
  const body = new FormData();
  body.append("file", file);
  if (classification !== undefined) {
    body.append("classification", classification);
  }
  return apiRequest(`/tickets/${ticketId}/attachments`, {
    method: "POST",
    body,
  });
}

export function downloadTicketAttachment(
  ticketId: string,
  attachmentId: string,
): Promise<Blob> {
  return apiBlobRequest(
    `/tickets/${ticketId}/attachments/${attachmentId}/content`,
  );
}

export function deleteTicketAttachment(
  ticketId: string,
  attachmentId: string,
): Promise<void> {
  return apiRequest(`/tickets/${ticketId}/attachments/${attachmentId}`, {
    method: "DELETE",
  });
}

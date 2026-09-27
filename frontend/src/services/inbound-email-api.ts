import { apiRequest } from "@/services/api";

export type InboundEmailStatus = {
  readonly enabled: boolean;
  readonly provider: "graph" | "imap";
  readonly address: string;
  readonly problems: readonly string[];
  readonly replyModeReady: boolean;
  readonly replyTokenReady: boolean;
  readonly state: {
    readonly lastRunAt: string | null;
    readonly lastSuccessAt: string | null;
    readonly lastError: string | null;
    readonly lastErrorAt: string | null;
    readonly consecutiveFails: number;
  } | null;
  readonly last24h: {
    readonly processed: number;
    readonly rejected: number;
    readonly ignored: number;
    readonly failed: number;
  };
  readonly recent: readonly InboundEmailLogEntry[];
};

export type InboundEmailLogEntry = {
  readonly id: string;
  readonly status: "PROCESSING" | "PROCESSED" | "REJECTED" | "IGNORED" | "FAILED";
  readonly reason: string | null;
  readonly fromAddress: string | null;
  readonly subject: string;
  readonly ticketId: string | null;
  readonly ticketNumber: string | null;
  readonly createdAt: string;
};

export type InboundEmailConnectionTest = {
  readonly ok: boolean;
  readonly inboxCount?: number;
  readonly error?: string;
  readonly problems: readonly string[];
};

export function getInboundEmailStatus(): Promise<InboundEmailStatus> {
  return apiRequest("/admin/inbound-email/status");
}

export function testInboundEmailConnection(): Promise<InboundEmailConnectionTest> {
  return apiRequest("/admin/inbound-email/test-connection", { method: "POST" });
}

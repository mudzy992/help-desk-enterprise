import { apiRequest } from "@/services/api";

export const inboundEmailRedactedValue = "[redacted]" as const;

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
    readonly lastError: typeof inboundEmailRedactedValue | null;
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
  readonly fromAddress: typeof inboundEmailRedactedValue;
  readonly subject: typeof inboundEmailRedactedValue;
  readonly ticketId: string | null;
  readonly ticketNumber: string | null;
  readonly createdAt: string;
};

export type InboundEmailConnectionTest =
  | {
      readonly ok: true;
      readonly inboxCount: number;
      readonly problems: readonly string[];
    }
  | {
      readonly ok: false;
      readonly errorCode?: "CONNECTION_FAILED";
      readonly problems: readonly string[];
    };

export function getInboundEmailStatus(): Promise<InboundEmailStatus> {
  return apiRequest("/admin/inbound-email/status");
}

export function testInboundEmailConnection(): Promise<InboundEmailConnectionTest> {
  return apiRequest("/admin/inbound-email/test-connection", { method: "POST" });
}

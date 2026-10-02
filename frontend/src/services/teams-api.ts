import { apiDownloadRequest, apiRequest } from "@/services/api";

/**
 * Paket 3.1 (§16): `/integrations/teams/*`. Types mirror
 * `backend/src/modules/teams/teams-admin.service.ts`. Admin routes need
 * `integrations.teams.manage`; `/me` is open to every signed-in user.
 */

export type TeamsMode = "off" | "simulator" | "live";

export type TeamsStatus = {
  readonly mode: TeamsMode;
  readonly configuredMode: "simulator" | "live";
  readonly addonEnabled: boolean;
  readonly simulatorAvailable: boolean;
  readonly personalConversations: number;
  readonly channelConversations: number;
  readonly linkedGroups: number;
  readonly lastInboundAt: string | null;
  readonly lastDeliveryAt: string | null;
  readonly failedDeliveries: number;
  readonly messagingEndpoint: string | null;
};

export type TeamsReadinessKey =
  | "addon"
  | "tenant"
  | "appId"
  | "credential"
  | "token"
  | "publicUrl"
  | "endpoint"
  | "simulatorSecret";

export type TeamsReadiness = {
  readonly ready: boolean;
  readonly mode: "simulator" | "live";
  readonly checks: readonly { readonly key: TeamsReadinessKey; readonly ok: boolean; readonly detail?: string }[];
};

export type TeamsChannelEvent =
  | "ticket.created_in_group"
  | "ticket.assigned_in_group"
  | "sla.warning"
  | "sla.breached";

export type TeamsChannelLink = {
  readonly id: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly teamName: string | null;
  readonly channelName: string | null;
  readonly mode: "simulator" | "live";
  readonly removed: boolean;
  readonly events: readonly string[];
  readonly includeTitle: boolean;
  readonly createdAt: string;
};

export type TeamsChannels = {
  readonly events: readonly TeamsChannelEvent[];
  readonly items: readonly TeamsChannelLink[];
};

export type TeamsSimulatorScope = "personal" | "channel";

export type TeamsSimulatorMessage = {
  readonly id: string;
  readonly activityId: string;
  readonly direction: "INBOUND" | "OUTBOUND";
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type TeamsSimulatorActivity = {
  readonly kind: "install" | "message" | "action";
  readonly userId: string;
  readonly scope: TeamsSimulatorScope;
  readonly text?: string;
  readonly verb?: string;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly replyToId?: string;
};

export type TeamsSimulatorResult = {
  readonly conversationId: string;
  readonly status: number;
  readonly response: Readonly<Record<string, unknown>> | null;
};

export function getTeamsMe(): Promise<{ readonly available: boolean; readonly connected: boolean }> {
  return apiRequest("/integrations/teams/me");
}

export function getTeamsStatus(): Promise<TeamsStatus> {
  return apiRequest("/integrations/teams/admin/status");
}

export function checkTeamsReadiness(): Promise<TeamsReadiness> {
  return apiRequest("/integrations/teams/admin/readiness", { method: "POST" });
}

export async function downloadTeamsPackage(locale: "bs" | "en"): Promise<{ readonly blob: Blob; readonly fileName: string }> {
  const downloaded = await apiDownloadRequest(`/integrations/teams/admin/package?locale=${locale}`);
  return { blob: downloaded.blob, fileName: downloaded.fileName ?? "teams-app.zip" };
}

export function listTeamsChannels(): Promise<TeamsChannels> {
  return apiRequest("/integrations/teams/admin/channels");
}

export function updateTeamsChannel(
  id: string,
  input: { readonly events?: readonly string[]; readonly includeTitle?: boolean },
): Promise<TeamsChannels> {
  return apiRequest(`/integrations/teams/admin/channels/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function removeTeamsChannel(id: string): Promise<TeamsChannels> {
  return apiRequest(`/integrations/teams/admin/channels/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function listTeamsSimulatorMessages(
  userId: string,
  scope: TeamsSimulatorScope,
): Promise<{ readonly conversationId: string; readonly items: readonly TeamsSimulatorMessage[] }> {
  const query = new URLSearchParams({ userId, scope });
  return apiRequest(`/integrations/teams/admin/simulator/messages?${query.toString()}`);
}

export function sendTeamsSimulatorActivity(input: TeamsSimulatorActivity): Promise<TeamsSimulatorResult> {
  return apiRequest("/integrations/teams/admin/simulator/activities", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

import { apiDownloadRequest, apiRequest } from "@/services/api";

/**
 * Paket 2.9 (K2): `/announcements/*`. Types mirror
 * `backend/src/modules/announcements`. Reading is for every signed-in user;
 * management is checked by the server (announcement.manage, or an agent
 * limited to the own unit when the setting allows it).
 */

export type AnnouncementSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AnnouncementDisplayMode = "BANNER" | "MODAL";
export type AnnouncementEffectiveStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ENDED" | "WITHDRAWN";

export type ActiveAnnouncement = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly severity: AnnouncementSeverity;
  readonly displayMode: AnnouncementDisplayMode;
  readonly requiresAcknowledgement: boolean;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly version: number;
  readonly serviceName: string | null;
};

export type ActiveAnnouncements = {
  readonly enabled: boolean;
  readonly announcements: readonly ActiveAnnouncement[];
};

export type ArchivedAnnouncement = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly severity: AnnouncementSeverity;
  readonly requiresAcknowledgement: boolean;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly isActive: boolean;
  readonly acknowledgedAt: string | null;
  readonly serviceName: string | null;
};

export type AnnouncementCapabilities = {
  readonly enabled: boolean;
  readonly canManage: boolean;
  readonly scopedToUnit: boolean;
  readonly canReadReports: boolean;
};

export type AnnouncementAudienceInput = {
  readonly roles: readonly string[];
  readonly organizationalUnitIds: readonly string[];
  readonly groupIds: readonly string[];
};

export type AnnouncementWriteInput = AnnouncementAudienceInput & {
  readonly title: string;
  readonly body: string;
  readonly severity: AnnouncementSeverity;
  readonly displayMode: AnnouncementDisplayMode;
  readonly requiresAcknowledgement: boolean;
  readonly notifyAudience: boolean;
  readonly sendEmail: boolean;
  readonly postToTeams: boolean;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly serviceId: string | null;
};

/** K2b: outcome of the Teams post. */
export type AnnouncementTeamsResult = "SENT" | "FAILED" | "SKIPPED_DISABLED";

export type AnnouncementEmailRunSummary = {
  readonly kind: "PUBLISHED" | "REMINDER";
  readonly sentCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly endReason: "EMAIL_CHANNEL_DISABLED" | "NOT_ACTIVE" | "EMAIL_OFF" | "NO_ACKNOWLEDGEMENT" | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
};

export type ManagedAnnouncement = AnnouncementAudienceInput & {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly severity: AnnouncementSeverity;
  readonly displayMode: AnnouncementDisplayMode;
  readonly requiresAcknowledgement: boolean;
  readonly notifyAudience: boolean;
  readonly sendEmail: boolean;
  readonly postToTeams: boolean;
  readonly teamsPostedAt: string | null;
  readonly teamsResult: AnnouncementTeamsResult | null;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly serviceId: string | null;
  readonly status: "DRAFT" | "PUBLISHED" | "WITHDRAWN";
  readonly effectiveStatus: AnnouncementEffectiveStatus;
  readonly version: number;
  readonly publishedAt: string | null;
  readonly withdrawnAt: string | null;
  readonly audienceSizeAtPublish: number | null;
  readonly lastReminderAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly acknowledgedCount?: number;
};

export type ManagedAnnouncementDetail = ManagedAnnouncement & {
  readonly revisions: ReadonlyArray<{ readonly version: number; readonly title: string; readonly body: string; readonly createdAt: string }>;
};

export type AnnouncementList = Omit<AnnouncementCapabilities, "enabled"> & {
  readonly announcements: readonly ManagedAnnouncement[];
};

export type AnnouncementOptions = Omit<AnnouncementCapabilities, "enabled"> & {
  readonly maxDurationDays: number;
  /** K2b: SMTP delivery is on, so "also by e-mail" can work. */
  readonly emailAvailable: boolean;
  /** K2b: Teams is enabled and a webhook is configured. */
  readonly teamsAvailable: boolean;
  readonly organizationalUnits: ReadonlyArray<{ readonly id: string; readonly name: string; readonly path: string }>;
  readonly groups: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly services: ReadonlyArray<{ readonly id: string; readonly name: string }>;
};

export type AnnouncementReport = {
  readonly id: string;
  readonly title: string;
  readonly requiresAcknowledgement: boolean;
  readonly audienceSizeAtPublish: number;
  readonly currentAudienceSize: number;
  readonly acknowledgedCount: number;
  readonly pendingCount: number;
  readonly lastReminderAt: string | null;
  readonly canRemind: boolean;
  readonly sendEmail: boolean;
  readonly postToTeams: boolean;
  readonly teamsPostedAt: string | null;
  readonly teamsResult: AnnouncementTeamsResult | null;
  readonly emailRuns: readonly AnnouncementEmailRunSummary[];
  readonly byUnit: ReadonlyArray<{ readonly unit: string; readonly audience: number; readonly acknowledged: number }>;
  readonly pending: ReadonlyArray<{ readonly id: string; readonly displayName: string; readonly unit: string }>;
};

export const announcementQueryKeys = {
  active: ["announcements", "active"] as const,
  archive: ["announcements", "archive"] as const,
  capabilities: ["announcements", "capabilities"] as const,
};

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export function getActiveAnnouncements(): Promise<ActiveAnnouncements> {
  return apiRequest<ActiveAnnouncements>("/announcements/active");
}

export async function getAnnouncementArchive(): Promise<readonly ArchivedAnnouncement[]> {
  const response = await apiRequest<{ readonly announcements: readonly ArchivedAnnouncement[] }>("/announcements/archive");
  return response.announcements;
}

export function acknowledgeAnnouncement(id: string): Promise<void> {
  return apiRequest<void>(`/announcements/${encodeURIComponent(id)}/acknowledge`, { method: "POST" });
}

export function dismissAnnouncement(id: string): Promise<void> {
  return apiRequest<void>(`/announcements/${encodeURIComponent(id)}/dismiss`, { method: "POST" });
}

export function getAnnouncementCapabilities(): Promise<AnnouncementCapabilities> {
  return apiRequest<AnnouncementCapabilities>("/announcements/manage/capabilities");
}

export function getAnnouncementOptions(): Promise<AnnouncementOptions> {
  return apiRequest<AnnouncementOptions>("/announcements/manage/options");
}

export function previewAnnouncementAudience(input: AnnouncementAudienceInput): Promise<{ readonly count: number }> {
  return apiRequest<{ readonly count: number }>("/announcements/manage/audience-preview", { method: "POST", ...json(input) });
}

export function listManagedAnnouncements(): Promise<AnnouncementList> {
  return apiRequest<AnnouncementList>("/announcements/manage");
}

export function getManagedAnnouncement(id: string): Promise<ManagedAnnouncementDetail> {
  return apiRequest<ManagedAnnouncementDetail>(`/announcements/manage/${encodeURIComponent(id)}`);
}

export function createAnnouncement(input: AnnouncementWriteInput): Promise<ManagedAnnouncementDetail> {
  return apiRequest<ManagedAnnouncementDetail>("/announcements/manage", { method: "POST", ...json(input) });
}

export function updateAnnouncement(id: string, input: AnnouncementWriteInput): Promise<ManagedAnnouncementDetail> {
  return apiRequest<ManagedAnnouncementDetail>(`/announcements/manage/${encodeURIComponent(id)}`, { method: "PUT", ...json(input) });
}

export function deleteAnnouncement(id: string): Promise<void> {
  return apiRequest<void>(`/announcements/manage/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function publishAnnouncement(id: string): Promise<ManagedAnnouncementDetail> {
  return apiRequest<ManagedAnnouncementDetail>(`/announcements/manage/${encodeURIComponent(id)}/publish`, { method: "POST" });
}

export function withdrawAnnouncement(id: string, reason: string): Promise<ManagedAnnouncementDetail> {
  return apiRequest<ManagedAnnouncementDetail>(`/announcements/manage/${encodeURIComponent(id)}/withdraw`, {
    method: "POST",
    ...json({ reason }),
  });
}

export function getAnnouncementReport(id: string): Promise<AnnouncementReport> {
  return apiRequest<AnnouncementReport>(`/announcements/manage/${encodeURIComponent(id)}/report`);
}

export async function downloadAnnouncementReport(id: string): Promise<{ readonly blob: Blob; readonly fileName: string }> {
  const downloaded = await apiDownloadRequest(`/announcements/manage/${encodeURIComponent(id)}/report.csv`);
  return { blob: downloaded.blob, fileName: downloaded.fileName ?? `announcement-${id}.csv` };
}

export function remindAnnouncement(id: string): Promise<{ readonly notified: number; readonly emailQueued: boolean }> {
  return apiRequest<{ readonly notified: number; readonly emailQueued: boolean }>(`/announcements/manage/${encodeURIComponent(id)}/remind`, { method: "POST" });
}

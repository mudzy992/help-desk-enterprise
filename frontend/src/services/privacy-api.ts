import { apiDownloadRequest, apiRequest, type ApiDownloadResult } from "@/services/api";

/**
 * Paket 2.6 (ZZLP BiH): `/privacy/*`. Types mirror the backend views
 * (`backend/src/modules/privacy/**`); reading needs `privacy.view`, changes
 * `privacy.manage`, anonymization `privacy.anonymize` (SUPER_ADMIN).
 */

export const dataSubjectRequestTypes = [
  "ACCESS",
  "PORTABILITY",
  "ERASURE",
  "RECTIFICATION",
  "RESTRICTION",
  "OBJECTION",
] as const;
export type DataSubjectRequestType = (typeof dataSubjectRequestTypes)[number];

export const dataSubjectRequestChannels = ["EMAIL", "PAPER", "PORTAL", "IN_PERSON"] as const;
export type DataSubjectRequestChannel = (typeof dataSubjectRequestChannels)[number];

export type DataSubjectRequestStatus = "RECEIVED" | "IN_PROGRESS" | "EXTENDED" | "COMPLETED" | "REJECTED";
export type DataSubjectRequestScope = "open" | "closed" | "all";

export type PersonRef = { readonly id: string; readonly displayName: string };

export type DataSubjectRequest = {
  readonly id: string;
  readonly type: DataSubjectRequestType;
  readonly status: DataSubjectRequestStatus;
  readonly channel: DataSubjectRequestChannel;
  readonly subjectLabel: string;
  readonly subjectUser: PersonRef | null;
  readonly handlerUser: PersonRef | null;
  readonly receivedAt: string;
  readonly dueAt: string;
  readonly extendedDueAt: string | null;
  readonly effectiveDueAt: string;
  /** Whole days left (negative = overdue); null once closed. */
  readonly daysLeft: number | null;
  readonly canExtend: boolean;
  readonly extensionReason: string | null;
  readonly rejectionReason: string | null;
  readonly notes: string | null;
  readonly resultRef: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
};

export type CreateDataSubjectRequestInput = {
  readonly type: DataSubjectRequestType;
  readonly channel: DataSubjectRequestChannel;
  readonly receivedAt: string;
  readonly subjectLabel: string;
  readonly subjectUserId?: string;
  readonly handlerUserId?: string;
  readonly notes?: string;
};

export type UpdateDataSubjectRequestInput = {
  readonly status?: "IN_PROGRESS";
  readonly subjectUserId?: string | null;
  readonly handlerUserId?: string | null;
  readonly notes?: string;
};

export type CloseDataSubjectRequestInput = {
  readonly outcome: "COMPLETED" | "REJECTED";
  readonly rejectionReason?: string;
  readonly resultRef?: string;
};

export const retentionCategories = [
  "attachments",
  "ticketContent",
  "audit",
  "sessions",
  "emailDeliveries",
  "requestRegister",
] as const;
export type RetentionCategory = (typeof retentionCategories)[number];

export type RetentionRunStatus = "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "SKIPPED";

export type RetentionRun = {
  readonly id: string;
  readonly category: RetentionCategory;
  readonly mode: "DRY_RUN" | "EXECUTE";
  readonly status: RetentionRunStatus;
  readonly configDays: number | null;
  readonly itemCount: number;
  readonly bytesFreed: number;
  readonly oldestAt: string | null;
  readonly newestAt: string | null;
  readonly refsCount: number;
  readonly refsTruncated: boolean;
  readonly error: string | null;
  readonly triggeredByUserId: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
};

export type RetentionGate =
  | { readonly allowed: true; readonly basis: "not_required" | "dry_run" | "previous_execution" }
  | { readonly allowed: false; readonly reason: "disabled" | "dry_run_required" };

export type RetentionCategoryView = {
  readonly category: RetentionCategory;
  readonly days: number;
  readonly enabled: boolean;
  readonly requiresDryRun: boolean;
  readonly gate: RetentionGate;
  readonly lastDryRun: RetentionRun | null;
  readonly lastExecution: RetentionRun | null;
};

export type RetentionOverview = {
  readonly runAtLocalTime: string;
  readonly timeZone: string;
  readonly maxMinutesPerNight: number;
  readonly categories: readonly RetentionCategoryView[];
};

export type LegalHoldTarget = "ticket" | "user";

export type LegalHold = {
  readonly target: LegalHoldTarget;
  readonly id: string;
  readonly label: string;
  readonly heldAt: string;
  readonly reason: string | null;
};

export type AnonymizationBlockReason =
  | "active"
  | "active_in_directory"
  | "super_admin"
  | "last_admin"
  | "legal_hold"
  | "open_assigned_tickets"
  | "export_in_progress"
  | "already_anonymized"
  | "erasure_in_progress"
  | "self";

export type AnonymizationCandidate = {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly inactiveSince: string;
  readonly deactivatedBy: "directory" | "admin";
  readonly requestedTickets: number;
};

export type AnonymizationPreview = {
  readonly ticketsInScope: number;
  readonly ticketsOnLegalHold: number;
  readonly textReplacements: number;
  readonly examples: readonly string[];
  readonly counts: Readonly<Record<string, number>>;
};

export type SubjectAssessment = {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly blockers: readonly AnonymizationBlockReason[];
  readonly preview: AnonymizationPreview | null;
  readonly requireSecondApprover: boolean;
  readonly deleteOwnAttachmentsDefault: boolean;
};

export type ErasureStatus = "PENDING_APPROVAL" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type Erasure = {
  readonly id: string;
  readonly userId: string;
  readonly pseudonym: string;
  readonly status: ErasureStatus;
  readonly deleteOwnAttachments: boolean;
  readonly requestId: string | null;
  readonly preview: AnonymizationPreview | null;
  readonly report: Readonly<Record<string, unknown>> | null;
  readonly error: string | null;
  readonly requestedByUserId: string | null;
  readonly approvedByUserId: string | null;
  readonly approvalDeadline: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
};

export type RequestAnonymizationInput = {
  readonly confirmEmail: string;
  readonly deleteOwnAttachments?: boolean;
  readonly requestId?: string;
  readonly code?: string;
};

export type ExportStatus = "QUEUED" | "RUNNING" | "READY" | "FAILED" | "EXPIRED";

export type PrivacyExport = {
  readonly id: string;
  readonly subjectUserId: string;
  readonly subjectName: string;
  readonly requestId: string | null;
  readonly status: ExportStatus;
  readonly includeAttachments: boolean;
  readonly includeInternalNotes: boolean;
  readonly sizeBytes: number | null;
  readonly downloadCount: number;
  readonly error: string | null;
  readonly requestedByUserId: string | null;
  readonly canDownload: boolean;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
};

export type CreatePrivacyExportInput = {
  readonly subjectUserId: string;
  readonly requestId?: string;
  readonly includeAttachments?: boolean;
  readonly includeInternalNotes?: boolean;
  readonly internalNotesReason?: string;
};

export type ProcessingRecord = {
  readonly locale: "bs" | "en";
  readonly generatedAt: string;
  readonly title: string;
  readonly missing: readonly string[];
  readonly sections: readonly {
    readonly key: string;
    readonly title: string;
    readonly rows: readonly { readonly label: string; readonly value: string }[];
  }[];
};

export type PrivacyNotice = {
  readonly locale: "bs" | "en";
  readonly markdown: string;
  readonly draft: boolean;
  readonly fallbackLocale: boolean;
};

const id = (value: string) => encodeURIComponent(value);
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

// --- §4 Requests ---------------------------------------------------------------
export function listDataSubjectRequests(scope: DataSubjectRequestScope): Promise<readonly DataSubjectRequest[]> {
  return apiRequest(`/privacy/requests?scope=${scope}`);
}
export function createDataSubjectRequest(input: CreateDataSubjectRequestInput): Promise<DataSubjectRequest> {
  return apiRequest("/privacy/requests", json("POST", input));
}
export function updateDataSubjectRequest(
  requestId: string,
  input: UpdateDataSubjectRequestInput,
): Promise<DataSubjectRequest> {
  return apiRequest(`/privacy/requests/${id(requestId)}`, json("PATCH", input));
}
export function extendDataSubjectRequest(requestId: string, reason: string): Promise<DataSubjectRequest> {
  return apiRequest(`/privacy/requests/${id(requestId)}/extend`, json("POST", { reason }));
}
export function closeDataSubjectRequest(
  requestId: string,
  input: CloseDataSubjectRequestInput,
): Promise<DataSubjectRequest> {
  return apiRequest(`/privacy/requests/${id(requestId)}/close`, json("POST", input));
}

// --- §7 Retention ----------------------------------------------------------------
export function getRetentionOverview(): Promise<RetentionOverview> {
  return apiRequest("/privacy/retention");
}
export function listRetentionRuns(category?: RetentionCategory): Promise<readonly RetentionRun[]> {
  return apiRequest(`/privacy/retention/runs${category === undefined ? "" : `?category=${category}`}`);
}
export function downloadRetentionRunRefs(runId: string): Promise<ApiDownloadResult> {
  return apiDownloadRequest(`/privacy/retention/runs/${id(runId)}/refs.csv`);
}
export function startRetentionDryRun(category: RetentionCategory): Promise<unknown> {
  return apiRequest(`/privacy/retention/${category}/dry-run`, json("POST"));
}
export function startRetentionRunNow(category: RetentionCategory): Promise<unknown> {
  return apiRequest(`/privacy/retention/${category}/run-now`, json("POST"));
}

// --- §7.4 Legal hold -------------------------------------------------------------
export function listLegalHolds(): Promise<readonly LegalHold[]> {
  return apiRequest("/privacy/legal-holds");
}
export function setLegalHold(target: LegalHoldTarget, targetId: string, reason: string): Promise<LegalHold> {
  return apiRequest(`/privacy/legal-holds/${target}/${id(targetId)}`, json("PUT", { reason }));
}
export function clearLegalHold(target: LegalHoldTarget, targetId: string, reason: string): Promise<void> {
  return apiRequest(`/privacy/legal-holds/${target}/${id(targetId)}`, json("DELETE", { reason }));
}

// --- §6 Anonymization ------------------------------------------------------------
export function listAnonymizationCandidates(): Promise<readonly AnonymizationCandidate[]> {
  return apiRequest("/privacy/anonymization/candidates");
}
export function assessAnonymization(userId: string): Promise<SubjectAssessment> {
  return apiRequest(`/privacy/anonymization/users/${id(userId)}/preview`);
}
export function requestAnonymization(userId: string, input: RequestAnonymizationInput): Promise<Erasure> {
  return apiRequest(`/privacy/anonymization/users/${id(userId)}`, json("POST", input));
}
export function listErasures(): Promise<readonly Erasure[]> {
  return apiRequest("/privacy/anonymization/erasures");
}
export function approveErasure(erasureId: string, code?: string): Promise<Erasure> {
  return apiRequest(`/privacy/anonymization/erasures/${id(erasureId)}/approve`, json("POST", code ? { code } : {}));
}
export function cancelErasure(erasureId: string): Promise<Erasure> {
  return apiRequest(`/privacy/anonymization/erasures/${id(erasureId)}/cancel`, json("POST"));
}

// --- §5 Exports --------------------------------------------------------------------
export function listPrivacyExports(): Promise<readonly PrivacyExport[]> {
  return apiRequest("/privacy/exports");
}
export function createPrivacyExport(input: CreatePrivacyExportInput): Promise<PrivacyExport> {
  return apiRequest("/privacy/exports", json("POST", input));
}
/** POST with the MFA code in the body; the response is the encrypted ZIP. */
export function downloadPrivacyExport(exportId: string, code?: string): Promise<ApiDownloadResult> {
  return apiDownloadRequest(`/privacy/exports/${id(exportId)}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(code ? { code } : {}),
  });
}

// --- §8 Record & notice ------------------------------------------------------------
export function getProcessingRecord(locale: "bs" | "en"): Promise<ProcessingRecord> {
  return apiRequest(`/privacy/record?locale=${locale}`);
}
/** Public (no session). */
export function getPrivacyNotice(locale: "bs" | "en"): Promise<PrivacyNotice> {
  return apiRequest(`/privacy/notice?locale=${locale}`);
}

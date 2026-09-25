import type { TicketCsatRecord } from '../tickets/csat/csat.types';
import type { TicketRecord } from '../tickets/tickets.types';
import type { KnowledgeArticleRecord } from '../knowledge-base/knowledge-base.types';
import type {
  ReportExportFormat,
  ReportPackKey,
} from './reports.constants';

export type ReportsConfiguration = {
  readonly reportsEnabled: boolean;
  readonly addonEnabled: boolean;
  readonly enabledPacks: readonly ReportPackKey[];
  readonly allowedFormats: readonly ReportExportFormat[];
  readonly bottlenecksEnabled: boolean;
  readonly defaultWindowDays: number;
  readonly pingPongThreshold: number;
};

export type ReportWindow = {
  readonly from: Date;
  readonly to: Date;
};

export type ReportExportRow = Record<string, string | number | null>;

export type ReportExportResult = {
  readonly format: ReportExportFormat;
  readonly fileName: string;
  readonly contentType: string;
  readonly content: string;
};

export type ReportTicketSnapshot = TicketRecord & {
  readonly isOverdue: boolean;
};

export type KnowledgeFeedbackVote = {
  readonly articleId: string;
  readonly isHelpful: boolean;
  readonly createdAt: Date;
};

export type CloseCodeLookup = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
};

export type ReportPackBuildInput = {
  readonly window: ReportWindow;
  readonly tickets: readonly ReportTicketSnapshot[];
  readonly csatByTicketId: ReadonlyMap<string, TicketCsatRecord>;
  readonly closeCodesById: ReadonlyMap<string, CloseCodeLookup>;
  readonly articles: readonly KnowledgeArticleRecord[];
  readonly feedback: readonly KnowledgeFeedbackVote[];
  /** Package 1.6 */
  readonly serviceNamesById?: ReadonlyMap<string, string>;
  readonly forwardTickets?: readonly ForwardPingPongTicket[];
  readonly pingPongThreshold?: number;
};

export type ForwardPingPongEvent = {
  readonly fromGroupId: string | null;
  readonly fromGroupName: string | null;
  readonly fromUnitId: string | null;
  readonly toGroupId: string;
  readonly toGroupName: string;
  readonly toUnitId: string;
  readonly isCrossOu: boolean;
  readonly createdAt: Date;
};

export type ForwardPingPongTicket = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly isConfidential: boolean;
  readonly status: string;
  readonly serviceName: string | null;
  readonly currentGroupName: string | null;
  /** Group-to-group forwards inside the window, oldest first. */
  readonly events: readonly ForwardPingPongEvent[];
};

export type ReportPackDescriptor = {
  readonly key: ReportPackKey;
  readonly slug: string;
  readonly columns: readonly string[];
};

export type ReportPackPreview = {
  readonly pack: ReportPackKey;
  readonly columns: readonly string[];
  readonly rows: readonly ReportExportRow[];
  readonly totalRows: number;
  readonly truncated: boolean;
  readonly window: { readonly from: string; readonly to: string };
};

export type BottleneckCounts = {
  readonly pendingApproval: number;
  readonly waitingForUser: number;
  readonly unrouted: number;
  readonly overdue: number;
};

export type BottleneckBreakdownRow = BottleneckCounts & {
  readonly key: string;
};

export type BottleneckTrendRow = BottleneckCounts & {
  readonly date: string;
  readonly createdCount: number;
};

export type BottleneckDashboard = {
  readonly window: { readonly from: string; readonly to: string };
  readonly counts: BottleneckCounts;
  readonly byOrganizationalUnit: readonly BottleneckBreakdownRow[];
  readonly byService: readonly BottleneckBreakdownRow[];
  readonly byPriority: readonly BottleneckBreakdownRow[];
  readonly trend: readonly BottleneckTrendRow[];
};

export type ReportScopeQuery = {
  readonly organizationalUnitId: string;
  readonly from?: string;
  readonly to?: string;
};

export type ExportReportPackQuery = ReportScopeQuery & {
  readonly format: ReportExportFormat;
  readonly pack: ReportPackKey;
};

import type { ComponentType } from "react";
import { lazyPage } from "@/app/lazy-page";
import type { ForbiddenMessageScope } from "@/components/layout/require-access";
import {
  canOpenAdminArea,
  canOpenAssets,
  canOpenChanges,
  canOpenConfigVersionsPage,
  canOpenOnCall,
  canOpenPrivacy,
  canOpenProblems,
  canOpenReports,
  canOpenTeamsAdminPage,
  canOpenTemplatesPage,
  navigationAccessKinds,
  type NavigationAccessKind,
} from "@/lib/session/route-access";
import type { SessionCapabilities } from "@/lib/session/use-session-capabilities";

export type ProtectedRouteDescriptor = {
  readonly path: string;
  readonly Page: ComponentType;
  readonly check: (capabilities: SessionCapabilities) => boolean;
  readonly accessKind: NavigationAccessKind;
  readonly forbiddenTitleKey: `${ForbiddenMessageScope}.forbiddenTitle`;
  readonly forbiddenBodyKey: `${ForbiddenMessageScope}.forbiddenBody`;
  /** Navigation destination whose icon represents this route's access fallback. */
  readonly iconPath: string;
};

const ReportsPage = lazyPage(() => import("@/pages/reports-page"), "ReportsPage");
const PrivacyPage = lazyPage(() => import("@/pages/privacy-page"), "PrivacyPage");
const OnCallPage = lazyPage(() => import("@/pages/on-call-page"), "OnCallPage");
const AssetsPage = lazyPage(() => import("@/pages/assets-page"), "AssetsPage");
const AssetDetailPage = lazyPage(() => import("@/pages/asset-detail-page"), "AssetDetailPage");
const ProblemsPage = lazyPage(() => import("@/pages/problems-page"), "ProblemsPage");
const ProblemDetailPage = lazyPage(
  () => import("@/pages/problem-detail-page"),
  "ProblemDetailPage",
);
const ChangesPage = lazyPage(() => import("@/pages/changes-page"), "ChangesPage");
const ChangeDetailPage = lazyPage(() => import("@/pages/change-detail-page"), "ChangeDetailPage");
const RoutingPage = lazyPage(() => import("@/pages/routing-page"), "RoutingPage");
const SlaPage = lazyPage(() => import("@/pages/sla-page"), "SlaPage");
const AdminPage = lazyPage(() => import("@/pages/admin-page"), "AdminPage");
const ConfigVersionsPage = lazyPage(
  () => import("@/pages/config-versions-page"),
  "ConfigVersionsPage",
);
const WorkflowPage = lazyPage(() => import("@/pages/workflow-page"), "WorkflowPage");
const TeamsAdminPage = lazyPage(() => import("@/pages/teams-admin-page"), "TeamsAdminPage");
const EmailTemplatesPage = lazyPage(
  () => import("@/pages/email-templates-page"),
  "EmailTemplatesPage",
);
const TemplatesPage = lazyPage(() => import("@/pages/templates-page"), "TemplatesPage");
const ResponseTemplateEditorPage = lazyPage(
  () => import("@/pages/response-template-editor-page"),
  "ResponseTemplateEditorPage",
);
const PlaybookEditorPage = lazyPage(
  () => import("@/pages/playbook-editor-page"),
  "PlaybookEditorPage",
);

const adminMessages = {
  forbiddenTitleKey: "admin.forbiddenTitle",
  forbiddenBodyKey: "admin.forbiddenBody",
} as const;

export const protectedRoutes: readonly ProtectedRouteDescriptor[] = [
  {
    path: "reports",
    Page: ReportsPage,
    check: canOpenReports,
    accessKind: navigationAccessKinds.reports,
    forbiddenTitleKey: "reports.forbiddenTitle",
    forbiddenBodyKey: "reports.forbiddenBody",
    iconPath: "/reports",
  },
  {
    path: "privacy",
    Page: PrivacyPage,
    check: canOpenPrivacy,
    accessKind: navigationAccessKinds.privacy,
    forbiddenTitleKey: "privacy.forbiddenTitle",
    forbiddenBodyKey: "privacy.forbiddenBody",
    iconPath: "/privacy",
  },
  {
    path: "on-call",
    Page: OnCallPage,
    check: canOpenOnCall,
    accessKind: navigationAccessKinds.onCall,
    forbiddenTitleKey: "onCall.forbiddenTitle",
    forbiddenBodyKey: "onCall.forbiddenBody",
    iconPath: "/on-call",
  },
  {
    path: "assets",
    Page: AssetsPage,
    check: canOpenAssets,
    accessKind: navigationAccessKinds.assets,
    forbiddenTitleKey: "assets.forbiddenTitle",
    forbiddenBodyKey: "assets.forbiddenBody",
    iconPath: "/assets",
  },
  {
    path: "assets/:assetId",
    Page: AssetDetailPage,
    check: canOpenAssets,
    accessKind: navigationAccessKinds.assets,
    forbiddenTitleKey: "assets.forbiddenTitle",
    forbiddenBodyKey: "assets.forbiddenBody",
    iconPath: "/assets",
  },
  {
    path: "problems",
    Page: ProblemsPage,
    check: canOpenProblems,
    accessKind: navigationAccessKinds.problems,
    forbiddenTitleKey: "problems.forbiddenTitle",
    forbiddenBodyKey: "problems.forbiddenBody",
    iconPath: "/problems",
  },
  {
    path: "problems/:problemId",
    Page: ProblemDetailPage,
    check: canOpenProblems,
    accessKind: navigationAccessKinds.problems,
    forbiddenTitleKey: "problems.forbiddenTitle",
    forbiddenBodyKey: "problems.forbiddenBody",
    iconPath: "/problems",
  },
  {
    path: "changes",
    Page: ChangesPage,
    check: canOpenChanges,
    accessKind: navigationAccessKinds.changes,
    forbiddenTitleKey: "changes.forbiddenTitle",
    forbiddenBodyKey: "changes.forbiddenBody",
    iconPath: "/changes",
  },
  {
    path: "changes/:changeId",
    Page: ChangeDetailPage,
    check: canOpenChanges,
    accessKind: navigationAccessKinds.changes,
    forbiddenTitleKey: "changes.forbiddenTitle",
    forbiddenBodyKey: "changes.forbiddenBody",
    iconPath: "/changes",
  },
  {
    path: "routing",
    Page: RoutingPage,
    check: canOpenAdminArea,
    accessKind: navigationAccessKinds.admin,
    forbiddenTitleKey: "routing.forbiddenTitle",
    forbiddenBodyKey: "routing.forbiddenBody",
    iconPath: "/routing",
  },
  {
    path: "sla",
    Page: SlaPage,
    check: canOpenAdminArea,
    accessKind: navigationAccessKinds.admin,
    forbiddenTitleKey: "sla.forbiddenTitle",
    forbiddenBodyKey: "sla.forbiddenBody",
    iconPath: "/sla",
  },
  {
    path: "admin",
    Page: AdminPage,
    check: canOpenAdminArea,
    accessKind: navigationAccessKinds.admin,
    ...adminMessages,
    iconPath: "/admin",
  },
  {
    path: "admin/config-versions",
    Page: ConfigVersionsPage,
    check: canOpenConfigVersionsPage,
    accessKind: navigationAccessKinds.configVersions,
    forbiddenTitleKey: "configVersions.forbiddenTitle",
    forbiddenBodyKey: "configVersions.forbiddenBody",
    iconPath: "/admin/config-versions",
  },
  {
    path: "admin/workflow",
    Page: WorkflowPage,
    check: canOpenAdminArea,
    accessKind: navigationAccessKinds.admin,
    ...adminMessages,
    iconPath: "/admin/workflow",
  },
  {
    path: "admin/teams",
    Page: TeamsAdminPage,
    check: canOpenTeamsAdminPage,
    accessKind: navigationAccessKinds.admin,
    ...adminMessages,
    iconPath: "/admin",
  },
  {
    path: "admin/email-templates",
    Page: EmailTemplatesPage,
    check: canOpenAdminArea,
    accessKind: navigationAccessKinds.admin,
    ...adminMessages,
    iconPath: "/admin",
  },
  {
    path: "admin/templates",
    Page: TemplatesPage,
    check: canOpenTemplatesPage,
    accessKind: navigationAccessKinds.staff,
    ...adminMessages,
    iconPath: "/admin/templates",
  },
  {
    path: "admin/templates/new",
    Page: ResponseTemplateEditorPage,
    check: canOpenTemplatesPage,
    accessKind: navigationAccessKinds.staff,
    ...adminMessages,
    iconPath: "/admin/templates",
  },
  {
    path: "admin/templates/:templateId",
    Page: ResponseTemplateEditorPage,
    check: canOpenTemplatesPage,
    accessKind: navigationAccessKinds.staff,
    ...adminMessages,
    iconPath: "/admin/templates",
  },
  {
    path: "admin/templates/playbooks/new",
    Page: PlaybookEditorPage,
    check: canOpenTemplatesPage,
    accessKind: navigationAccessKinds.staff,
    ...adminMessages,
    iconPath: "/admin/templates",
  },
  {
    path: "admin/templates/playbooks/:playbookId",
    Page: PlaybookEditorPage,
    check: canOpenTemplatesPage,
    accessKind: navigationAccessKinds.staff,
    ...adminMessages,
    iconPath: "/admin/templates",
  },
];

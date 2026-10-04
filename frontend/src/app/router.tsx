import {
  BarChart3,
  GitBranch,
  History,
  Mail,
  Settings2,
  Timer,
  GitFork,
  MessageSquare,
  MessageSquareText,
  ShieldCheck,
  CalendarClock,
} from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { InstallSetupLayout } from "@/app/install-setup-layout";
import { lazyPage } from "@/app/lazy-page";
import { RequireAccess } from "@/components/layout/require-access";
import { RequireAuth } from "@/components/layout/require-auth";
import { ApplicationShell } from "@/layouts/application-shell";
import {
  canOpenAdminArea,
  canOpenConfigVersionsPage,
  canOpenEmailTemplatesPage,
  canOpenTeamsAdminPage,
  canOpenPrivacy,
  canOpenOnCall,
  canOpenReports,
  canOpenRouting,
  canOpenSla,
  canOpenTemplatesPage,
} from "@/lib/session/route-access";
import { DashboardPage } from "@/pages/dashboard-page";
import { KnowledgeArticleDetailPage } from "@/pages/knowledge-article-detail-page";
import { KnowledgeBasePage } from "@/pages/knowledge-base-page";
import { AppearancePage } from "@/pages/appearance-page";
import { LoginPage } from "@/pages/login-page";
import { AuthCallbackPage } from "@/pages/auth-callback-page";
import { ServicesPage } from "@/pages/services-page";
import { LegacyAdminRedirect } from "@/pages/legacy-admin-redirect";
import { TicketsPage } from "@/pages/tickets-page";
import { TicketCreatePage } from "@/pages/ticket-create-page";
import { TicketDetailPage } from "@/pages/ticket-detail-page";
import { TicketListPage } from "@/pages/ticket-list-page";

const InstallPage = lazyPage(() => import("@/pages/install-page"), "InstallPage");
const AdminPage = lazyPage(() => import("@/pages/admin-page"), "AdminPage");
const TeamsAdminPage = lazyPage(() => import("@/pages/teams-admin-page"), "TeamsAdminPage");
const ReportsPage = lazyPage(() => import("@/pages/reports-page"), "ReportsPage");
const RoutingPage = lazyPage(() => import("@/pages/routing-page"), "RoutingPage");
const ConfigVersionsPage = lazyPage(() => import("@/pages/config-versions-page"), "ConfigVersionsPage");
const WorkflowPage = lazyPage(() => import("@/pages/workflow-page"), "WorkflowPage");
const EmailTemplatesPage = lazyPage(() => import("@/pages/email-templates-page"), "EmailTemplatesPage");
const TemplatesPage = lazyPage(() => import("@/pages/templates-page"), "TemplatesPage");
const ResponseTemplateEditorPage = lazyPage(
  () => import("@/pages/response-template-editor-page"),
  "ResponseTemplateEditorPage",
);
const PlaybookEditorPage = lazyPage(() => import("@/pages/playbook-editor-page"), "PlaybookEditorPage");
const AccountSecurityPage = lazyPage(() => import("@/pages/account-security-page"), "AccountSecurityPage");
const AccountNotificationsPage = lazyPage(
  () => import("@/pages/account-notifications-page"),
  "AccountNotificationsPage",
);
const PrivacyPage = lazyPage(() => import("@/pages/privacy-page"), "PrivacyPage");
const PrivacyNoticePage = lazyPage(() => import("@/pages/privacy-notice-page"), "PrivacyNoticePage");
const SlaPage = lazyPage(() => import("@/pages/sla-page"), "SlaPage");
const DocsPage = lazyPage(() => import("@/pages/docs-page"), "DocsPage");
const StatusPage = lazyPage(() => import("@/pages/status-page"), "StatusPage");
const OnCallPage = lazyPage(() => import("@/pages/on-call-page"), "OnCallPage");
const AnnouncementsPage = lazyPage(() => import("@/pages/announcements-page"), "AnnouncementsPage");
const AssetsPage = lazyPage(() => import("@/pages/assets-page"), "AssetsPage");
const AssetDetailPage = lazyPage(() => import("@/pages/asset-detail-page"), "AssetDetailPage");
const MyAssetsPage = lazyPage(() => import("@/pages/my-assets-page"), "MyAssetsPage");
const ProblemsPage = lazyPage(() => import("@/pages/problems-page"), "ProblemsPage");
const ProblemDetailPage = lazyPage(() => import("@/pages/problem-detail-page"), "ProblemDetailPage");
const ChangesPage = lazyPage(() => import("@/pages/changes-page"), "ChangesPage");
const ChangeDetailPage = lazyPage(() => import("@/pages/change-detail-page"), "ChangeDetailPage");
const VisualQaPrimitivesPage = import.meta.env.DEV
  ? lazyPage(() => import("@/pages/visual-qa-primitives-page"), "VisualQaPrimitivesPage")
  : null;

export function AppRouter() {
  return (
    <Routes>
      <Route element={<InstallSetupLayout />}>
        <Route path="install" element={<InstallPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="auth/callback" element={<AuthCallbackPage />} />
        {/* Paket 2.6 (§8): public, readable before signing in. */}
        <Route path="privacy-notice" element={<PrivacyNoticePage />} />
        <Route element={<RequireAuth />}>
          <Route element={<ApplicationShell />}>
            <Route index element={<DashboardPage />} />
            <Route
              path="reports"
              element={
                <RequireAccess
                  check={canOpenReports}
                  forbiddenTitleKey="reports.forbiddenTitle"
                  forbiddenBodyKey="reports.forbiddenBody"
                  icon={<BarChart3 size={18} strokeWidth={1.8} />}
                >
                  <ReportsPage />
                </RequireAccess>
              }
            />
            <Route
              path="privacy"
              element={
                <RequireAccess
                  check={canOpenPrivacy}
                  forbiddenTitleKey="privacy.forbiddenTitle"
                  forbiddenBodyKey="privacy.forbiddenBody"
                  icon={<ShieldCheck size={18} strokeWidth={1.8} />}
                >
                  <PrivacyPage />
                </RequireAccess>
              }
            />
            <Route path="tickets" element={<TicketsPage />}>
              <Route index element={<TicketListPage />} />
              <Route path="new" element={<TicketCreatePage />} />
              <Route path=":ticketId" element={<TicketDetailPage />} />
            </Route>
            <Route path="services" element={<ServicesPage />} />
            {/* Paket 2.7 (§8): every signed-in user; managing is gated server-side. */}
            <Route path="status" element={<StatusPage />} />
            {/* Faza 3 (c): Dokumentacija — svaki prijavljeni korisnik; uloge filtrira server. */}
            <Route path="docs" element={<DocsPage />} />
            <Route path="docs/:slug" element={<DocsPage />} />
            {/* Paket 2.9 (K2): archive for everyone; managing is gated server-side. */}
            <Route path="announcements" element={<AnnouncementsPage />} />
            {/* Paket 2.9 (K3): on-call calendar, holders of oncall.read. */}
            <Route
              path="on-call"
              element={
                <RequireAccess
                  check={canOpenOnCall}
                  forbiddenTitleKey="onCall.forbiddenTitle"
                  forbiddenBodyKey="onCall.forbiddenBody"
                  icon={<CalendarClock size={18} strokeWidth={1.8} />}
                >
                  <OnCallPage />
                </RequireAccess>
              }
            />
            {/* Paket 3.2: CMDB; the pages handle "module off" and the server enforces scope. */}
            <Route path="assets">
              <Route index element={<AssetsPage />} />
              <Route path=":assetId" element={<AssetDetailPage />} />
            </Route>
            <Route path="my-assets" element={<MyAssetsPage />} />
            {/* Paket 3.3: problems; the pages handle "module off" and the server enforces scope. */}
            <Route path="problems">
              <Route index element={<ProblemsPage />} />
              <Route path=":problemId" element={<ProblemDetailPage />} />
            </Route>
            {/* Paket 3.4: changes; same pattern as problems. */}
            <Route path="changes">
              <Route index element={<ChangesPage />} />
              <Route path=":changeId" element={<ChangeDetailPage />} />
            </Route>
            <Route path="knowledge-base">
              <Route index element={<KnowledgeBasePage />} />
              <Route path=":articleId" element={<KnowledgeArticleDetailPage />} />
            </Route>
            <Route path="appearance" element={<AppearancePage />} />
            <Route path="account/security" element={<AccountSecurityPage />} />
            <Route path="account/notifications" element={<AccountNotificationsPage />} />
            <Route
              path="users"
              element={<LegacyAdminRedirect tab="users" />}
            />
            <Route
              path="organizational-units"
              element={<LegacyAdminRedirect tab="org" />}
            />
            <Route
              path="routing"
              element={
                <RequireAccess
                  check={canOpenRouting}
                  forbiddenTitleKey="routing.forbiddenTitle"
                  forbiddenBodyKey="routing.forbiddenBody"
                  icon={<GitBranch size={18} strokeWidth={1.8} />}
                >
                  <RoutingPage />
                </RequireAccess>
              }
            />
            <Route
              path="sla"
              element={
                <RequireAccess
                  check={canOpenSla}
                  forbiddenTitleKey="sla.forbiddenTitle"
                  forbiddenBodyKey="sla.forbiddenBody"
                  icon={<Timer size={18} strokeWidth={1.8} />}
                >
                  <SlaPage />
                </RequireAccess>
              }
            />
            <Route
              path="settings"
              element={<LegacyAdminRedirect tab="settings" />}
            />
            <Route
              path="admin"
              element={
                <RequireAccess
                  check={canOpenAdminArea}
                  forbiddenTitleKey="admin.forbiddenTitle"
                  forbiddenBodyKey="admin.forbiddenBody"
                  icon={<Settings2 size={18} strokeWidth={1.8} />}
                >
                  <AdminPage />
                </RequireAccess>
              }
            />
            <Route
              path="admin/queue"
              element={<LegacyAdminRedirect tab="ops" />}
            />
            <Route
              path="admin/config-versions"
              element={
                <RequireAccess
                  check={canOpenConfigVersionsPage}
                  forbiddenTitleKey="configVersions.forbiddenTitle"
                  forbiddenBodyKey="configVersions.forbiddenBody"
                  icon={<History size={18} strokeWidth={1.8} />}
                >
                  <ConfigVersionsPage />
                </RequireAccess>
              }
            />
            <Route
              path="admin/workflow"
              element={
                <RequireAccess
                  check={canOpenAdminArea}
                  forbiddenTitleKey="admin.forbiddenTitle"
                  forbiddenBodyKey="admin.forbiddenBody"
                  icon={<GitFork size={18} strokeWidth={1.8} />}
                >
                  <WorkflowPage />
                </RequireAccess>
              }
            />
            <Route
              path="admin/teams"
              element={
                <RequireAccess
                  check={canOpenTeamsAdminPage}
                  forbiddenTitleKey="admin.forbiddenTitle"
                  forbiddenBodyKey="admin.forbiddenBody"
                  icon={<MessageSquare size={18} strokeWidth={1.8} />}
                >
                  <TeamsAdminPage />
                </RequireAccess>
              }
            />
            <Route
              path="admin/email-templates"
              element={
                <RequireAccess
                  check={canOpenEmailTemplatesPage}
                  forbiddenTitleKey="admin.forbiddenTitle"
                  forbiddenBodyKey="admin.forbiddenBody"
                  icon={<Mail size={18} strokeWidth={1.8} />}
                >
                  <EmailTemplatesPage />
                </RequireAccess>
              }
            />
            <Route
              path="admin/templates"
              element={
                <RequireAccess
                  check={canOpenTemplatesPage}
                  forbiddenTitleKey="admin.forbiddenTitle"
                  forbiddenBodyKey="admin.forbiddenBody"
                  icon={<MessageSquareText size={18} strokeWidth={1.8} />}
                >
                  <TemplatesPage />
                </RequireAccess>
              }
            />
            <Route
              path="admin/templates/new"
              element={
                <RequireAccess
                  check={canOpenTemplatesPage}
                  forbiddenTitleKey="admin.forbiddenTitle"
                  forbiddenBodyKey="admin.forbiddenBody"
                  icon={<MessageSquareText size={18} strokeWidth={1.8} />}
                >
                  <ResponseTemplateEditorPage />
                </RequireAccess>
              }
            />
            <Route
              path="admin/templates/:templateId"
              element={
                <RequireAccess
                  check={canOpenTemplatesPage}
                  forbiddenTitleKey="admin.forbiddenTitle"
                  forbiddenBodyKey="admin.forbiddenBody"
                  icon={<MessageSquareText size={18} strokeWidth={1.8} />}
                >
                  <ResponseTemplateEditorPage />
                </RequireAccess>
              }
            />
            <Route
              path="admin/templates/playbooks/new"
              element={
                <RequireAccess
                  check={canOpenTemplatesPage}
                  forbiddenTitleKey="admin.forbiddenTitle"
                  forbiddenBodyKey="admin.forbiddenBody"
                  icon={<MessageSquareText size={18} strokeWidth={1.8} />}
                >
                  <PlaybookEditorPage />
                </RequireAccess>
              }
            />
            <Route
              path="admin/templates/playbooks/:playbookId"
              element={
                <RequireAccess
                  check={canOpenTemplatesPage}
                  forbiddenTitleKey="admin.forbiddenTitle"
                  forbiddenBodyKey="admin.forbiddenBody"
                  icon={<MessageSquareText size={18} strokeWidth={1.8} />}
                >
                  <PlaybookEditorPage />
                </RequireAccess>
              }
            />
            {/* Review N9: the primitives QA page exists in development builds only. */}
            {VisualQaPrimitivesPage !== null ? (
              <Route path="_visual-qa" element={<VisualQaPrimitivesPage />} />
            ) : null}
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

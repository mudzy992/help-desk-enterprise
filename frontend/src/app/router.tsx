import {
  BarChart3,
  GitBranch,
  History,
  Mail,
  Settings2,
  Timer,
  GitFork,
  MessageSquareText,
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
const SlaPage = lazyPage(() => import("@/pages/sla-page"), "SlaPage");
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
            <Route path="tickets" element={<TicketsPage />}>
              <Route index element={<TicketListPage />} />
              <Route path="new" element={<TicketCreatePage />} />
              <Route path=":ticketId" element={<TicketDetailPage />} />
            </Route>
            <Route path="services" element={<ServicesPage />} />
            <Route path="knowledge-base">
              <Route index element={<KnowledgeBasePage />} />
              <Route path=":articleId" element={<KnowledgeArticleDetailPage />} />
            </Route>
            <Route path="appearance" element={<AppearancePage />} />
            <Route path="account/security" element={<AccountSecurityPage />} />
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

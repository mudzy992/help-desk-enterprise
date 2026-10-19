import { createBrowserRouter, Route, Routes } from "react-router-dom";
import { InstallSetupLayout } from "@/app/install-setup-layout";
import { lazyPage } from "@/app/lazy-page";
import { ProtectedRoute } from "@/app/protected-route";
import { protectedRoutes } from "@/app/protected-route-catalog";
import { RequireAuth } from "@/components/layout/require-auth";
import { RouteErrorElement } from "@/components/layout/route-error-boundary";
import { ApplicationShell } from "@/layouts/application-shell";
import { DashboardPage } from "@/pages/dashboard-page";
import { NotFoundPage } from "@/pages/not-found-page";
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
const AccountSecurityPage = lazyPage(
  () => import("@/pages/account-security-page"),
  "AccountSecurityPage",
);
const AccountNotificationsPage = lazyPage(
  () => import("@/pages/account-notifications-page"),
  "AccountNotificationsPage",
);
const PrivacyNoticePage = lazyPage(
  () => import("@/pages/privacy-notice-page"),
  "PrivacyNoticePage",
);
const DocsPage = lazyPage(() => import("@/pages/docs-page"), "DocsPage");
const StatusPage = lazyPage(() => import("@/pages/status-page"), "StatusPage");
const AnnouncementsPage = lazyPage(() => import("@/pages/announcements-page"), "AnnouncementsPage");
const MyAssetsPage = lazyPage(() => import("@/pages/my-assets-page"), "MyAssetsPage");
const VisualQaPrimitivesPage = import.meta.env.DEV
  ? lazyPage(() => import("@/pages/visual-qa-primitives-page"), "VisualQaPrimitivesPage")
  : null;
// The install preview is public and available in development builds only.
const InstallPreviewPage = import.meta.env.DEV
  ? lazyPage(() => import("@/pages/install-preview-page"), "InstallPreviewPage")
  : null;

export function AppRouter() {
  return (
    <Routes>
      {InstallPreviewPage !== null ? (
        <Route path="install-preview" element={<InstallPreviewPage />} />
      ) : null}
      <Route element={<InstallSetupLayout />}>
        <Route path="install" element={<InstallPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="auth/callback" element={<AuthCallbackPage />} />
        <Route path="privacy-notice" element={<PrivacyNoticePage />} />
        <Route element={<RequireAuth />}>
          <Route element={<ApplicationShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="tickets" element={<TicketsPage />}>
              <Route index element={<TicketListPage />} />
              <Route path="new" element={<TicketCreatePage />} />
              <Route path=":ticketId" element={<TicketDetailPage />} />
            </Route>
            <Route path="services" element={<ServicesPage />} />
            <Route path="status" element={<StatusPage />} />
            <Route path="docs" element={<DocsPage />} />
            <Route path="docs/:slug" element={<DocsPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="my-assets" element={<MyAssetsPage />} />
            <Route path="knowledge-base">
              <Route index element={<KnowledgeBasePage />} />
              <Route path=":articleId" element={<KnowledgeArticleDetailPage />} />
            </Route>
            <Route path="appearance" element={<AppearancePage />} />
            <Route path="account/security" element={<AccountSecurityPage />} />
            <Route path="account/notifications" element={<AccountNotificationsPage />} />
            <Route path="users" element={<LegacyAdminRedirect tab="users" />} />
            <Route path="organizational-units" element={<LegacyAdminRedirect tab="org" />} />
            <Route path="settings" element={<LegacyAdminRedirect tab="settings" />} />
            <Route path="admin/queue" element={<LegacyAdminRedirect tab="ops" />} />
            {protectedRoutes.map((descriptor) => (
              <Route
                key={descriptor.path}
                path={descriptor.path}
                element={<ProtectedRoute descriptor={descriptor} />}
              />
            ))}
            {VisualQaPrimitivesPage !== null ? (
              <Route path="_visual-qa" element={<VisualQaPrimitivesPage />} />
            ) : null}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

export const appRouter = createBrowserRouter([
  {
    id: "app-root",
    path: "/*",
    element: <AppRouter />,
    errorElement: <RouteErrorElement />,
  },
]);

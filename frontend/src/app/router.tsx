import { Navigate, Route, Routes } from "react-router-dom";
import { InstallSetupLayout } from "@/app/install-setup-layout";
import { ApplicationShell } from "@/layouts/application-shell";
import { DashboardPage } from "@/pages/dashboard-page";
import { InstallPage } from "@/pages/install-page";
import { KnowledgeBasePage } from "@/pages/knowledge-base-page";
import { OrganizationalUnitsPage } from "@/pages/organizational-units-page";
import { RoutingPage } from "@/pages/routing-page";
import { SettingsPage } from "@/pages/settings-page";
import { TicketsPage } from "@/pages/tickets-page";
import { UsersPage } from "@/pages/users-page";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<InstallSetupLayout />}>
        <Route path="install" element={<InstallPage />} />
        <Route element={<ApplicationShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="tickets" element={<TicketsPage />} />
          <Route path="knowledge-base" element={<KnowledgeBasePage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="organizational-units" element={<OrganizationalUnitsPage />} />
          <Route path="routing" element={<RoutingPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

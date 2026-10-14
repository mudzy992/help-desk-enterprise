import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { appRouter } from "@/app/router";
import { InstallSetupProvider } from "@/app/install-setup-provider";
import { RouteErrorBoundary } from "@/components/layout/route-error-boundary";
import { ToastProvider } from "@/components/ui/toast";
import { helpdeskQueryClient } from "@/lib/query/query-client";
import { ThemeProvider } from "@/lib/theme/theme-provider";

export function App() {
  return (
    <RouteErrorBoundary>
      <QueryClientProvider client={helpdeskQueryClient}>
        <ThemeProvider>
          <ToastProvider>
            <InstallSetupProvider>
              <RouterProvider router={appRouter} />
            </InstallSetupProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </RouteErrorBoundary>
  );
}

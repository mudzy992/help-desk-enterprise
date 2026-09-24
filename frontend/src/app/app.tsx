import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "@/app/router";
import { InstallSetupProvider } from "@/app/install-setup-provider";
import { ToastProvider } from "@/components/ui/toast";
import { helpdeskQueryClient } from "@/lib/query/query-client";
import { ThemeProvider } from "@/lib/theme/theme-provider";

export function App() {
  return (
    <QueryClientProvider client={helpdeskQueryClient}>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <InstallSetupProvider>
              <AppRouter />
            </InstallSetupProvider>
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

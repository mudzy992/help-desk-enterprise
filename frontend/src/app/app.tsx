import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "@/app/router";
import { InstallSetupProvider } from "@/app/install-setup-provider";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/lib/theme/theme-provider";

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <InstallSetupProvider>
            <AppRouter />
          </InstallSetupProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}

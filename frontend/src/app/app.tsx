import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "@/app/router";
import { InstallSetupProvider } from "@/app/install-setup-provider";

export function App() {
  return (
    <BrowserRouter>
      <InstallSetupProvider>
        <AppRouter />
      </InstallSetupProvider>
    </BrowserRouter>
  );
}

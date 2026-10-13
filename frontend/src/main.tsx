import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import { App } from "@/app/app";
import { initializeI18n } from "@/i18n/config";
import { reloadForChunkError } from "@/lib/app/chunk-reload";
import { reportClientError } from "@/lib/app/client-logger";
import { startBranding } from "@/lib/branding/branding-store";
import { migrateLegacyStorageKeys } from "@/lib/storage/legacy-storage-keys";
import "@/index.css";

// Vite reports a failed modulepreload (stale build after a redeploy) here.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForChunkError((event as Event & { payload?: unknown }).payload)) event.preventDefault();
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element was not found");
}

// Normally already done by the pre-paint script in index.html; kept for safety.
if (typeof window !== "undefined") migrateLegacyStorageKeys(window.localStorage);
startBranding();

function renderApplication(root: HTMLElement): void {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// A failed locale load must not leave a blank page: the UI renders with
// translation keys as a fallback and the error is reported.
void initializeI18n()
  .catch((error: unknown) => reportClientError("i18n_init_failed", error))
  .finally(() => renderApplication(rootElement));

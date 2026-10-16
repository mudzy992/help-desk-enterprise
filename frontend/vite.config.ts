import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

const nestTarget = "http://127.0.0.1:10001";

/** Browser document navigations stay on the SPA; XHR/fetch go to Nest. */
function spaDocumentBypass(request: { headers: { accept?: string } }): string | undefined {
  if (request.headers.accept?.includes("text/html")) {
    return "/index.html";
  }
  return undefined;
}

/** Same-origin Nest proxy; strip HSTS so http://localhost is not pinned to HTTPS. */
function nestProxy(options: { readonly bypass?: typeof spaDocumentBypass; readonly ws?: boolean } = {}): ProxyOptions {
  return {
    target: nestTarget,
    changeOrigin: true,
    ...(options.ws ? { ws: true } : {}),
    ...(options.bypass ? { bypass: options.bypass } : {}),
    configure(proxy) {
      proxy.on("proxyRes", (proxyRes) => {
        delete proxyRes.headers["strict-transport-security"];
      });
    },
  };
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    // Hashed bundles live under /static/, not Vite's default /assets/: the SPA
    // owns the /assets route (CMDB module), and a build directory of the same
    // name made nginx answer a refresh of /assets with a directory redirect.
    assetsDir: "static",
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: [".e2b.app"],
    // Local E2E / `npm run dev`: the session cookie is host-only. Point
    // `VITE_API_BASE_URL` at "" so the browser talks to this origin, and proxy
    // API + Socket.IO to the Nest process (default PORT 10001). SPA navigations
    // that share an API prefix (`/install`, `/tickets`, …) must stay on index.html.
    proxy: {
      "/auth": nestProxy(),
      "/install": nestProxy({ bypass: spaDocumentBypass }),
      "/setup-checklist": nestProxy({ bypass: spaDocumentBypass }),
      "/tickets": nestProxy({ bypass: spaDocumentBypass }),
      "/users": nestProxy({ bypass: spaDocumentBypass }),
      "/groups": nestProxy({ bypass: spaDocumentBypass }),
      "/organizational-units": nestProxy({ bypass: spaDocumentBypass }),
      "/services": nestProxy({ bypass: spaDocumentBypass }),
      "/settings": nestProxy({ bypass: spaDocumentBypass }),
      "/health": nestProxy(),
      "/socket.io": nestProxy({ ws: true }),
    },
  },
});

import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
    port: 5173,
  },
});

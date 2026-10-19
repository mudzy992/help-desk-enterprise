import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const nginxUrl = new URL("../../../nginx.conf", import.meta.url);
const headersUrl = new URL("../../../security-headers.inc.template", import.meta.url);
const rendererUrl = new URL("../../../scripts/render-security-headers.sh", import.meta.url);
const dockerfileUrl = new URL("../../../Dockerfile", import.meta.url);
const nginx = readFileSync(nginxUrl, "utf8");
const headers = readFileSync(headersUrl, "utf8");
const dockerfile = readFileSync(dockerfileUrl, "utf8");

describe("deployment CSP contract", () => {
  it("attaches generated security headers to every static frontend response location", () => {
    expect(nginx.match(/include \/etc\/nginx\/conf\.d\/security-headers\.inc;/g)).toHaveLength(3);
    expect(nginx).toContain("location = /index.html");
    expect(nginx).toContain("location /static/");
    expect(nginx).toContain("location /");
    expect(dockerfile).toContain("40-render-security-headers.sh");
  });

  it("permits only the configured API, Turnstile and Entra origins", () => {
    expect(headers).toContain("default-src 'self'");
    expect(headers).toContain("object-src 'none'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toMatch(/connect-src[^;]*\$\{CSP_API_CONNECT_SOURCES\}/);
    expect(headers).toMatch(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(headers).toMatch(/frame-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(headers).toMatch(/connect-src[^;]*https:\/\/login\.microsoftonline\.com/);
    expect(headers).toMatch(/frame-src[^;]*https:\/\/login\.microsoftonline\.com/);
  });

  it("renders the configured cross-origin API and websocket hosts", () => {
    const outputPath = join(tmpdir(), `helpdesk-security-headers-${process.pid}.inc`);
    try {
      execFileSync("sh", [rendererUrl.pathname], {
        env: {
          ...process.env,
          VITE_API_BASE_URL: "https://api.example.test/v1/",
          SECURITY_HEADERS_TEMPLATE_PATH: headersUrl.pathname,
          SECURITY_HEADERS_OUTPUT_PATH: outputPath,
        },
      });
      const rendered = readFileSync(outputPath, "utf8");
      expect(rendered).toContain(
        "connect-src 'self' https://api.example.test wss://api.example.test",
      );
      expect(rendered).not.toContain("${CSP_API_CONNECT_SOURCES}");
    } finally {
      rmSync(outputPath, { force: true });
    }
  });
});

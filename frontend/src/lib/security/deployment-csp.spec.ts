import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const nginx = readFileSync(new URL("../../../nginx.conf", import.meta.url), "utf8");
const headers = readFileSync(new URL("../../../security-headers.inc", import.meta.url), "utf8");

describe("deployment CSP contract", () => {
  it("attaches security headers to every static frontend response location", () => {
    expect(nginx.match(/include \/etc\/nginx\/conf\.d\/security-headers\.inc;/g)).toHaveLength(3);
    expect(nginx).toContain("location = /index.html");
    expect(nginx).toContain("location /static/");
    expect(nginx).toContain("location /");
  });

  it("permits only the external origins needed by Turnstile and Entra", () => {
    expect(headers).toContain("default-src 'self'");
    expect(headers).toContain("object-src 'none'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toMatch(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(headers).toMatch(/frame-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(headers).toMatch(/connect-src[^;]*https:\/\/login\.microsoftonline\.com/);
    expect(headers).toMatch(/frame-src[^;]*https:\/\/login\.microsoftonline\.com/);
  });
});

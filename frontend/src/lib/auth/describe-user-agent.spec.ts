import { describe, expect, it } from "vitest";
import { describeUserAgent, formatDevice } from "@/lib/auth/describe-user-agent";

describe("describeUserAgent", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0", "Edge · Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36", "Chrome · Windows"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0", "Firefox · Linux"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", "Safari · iOS"],
  ])("recognises %s", (userAgent, expected) => {
    expect(formatDevice(describeUserAgent(userAgent), "?")).toBe(expected);
  });

  it("falls back for unknown or missing agents", () => {
    expect(formatDevice(describeUserAgent(null), "Nepoznat uređaj")).toBe("Nepoznat uređaj");
    expect(formatDevice(describeUserAgent("curl/8.0"), "Nepoznat uređaj")).toBe("Nepoznat uređaj");
  });
});

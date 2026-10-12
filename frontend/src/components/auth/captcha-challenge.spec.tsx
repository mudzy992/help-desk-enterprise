import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CaptchaChallenge, loadTurnstileScript, turnstileScriptUrl } from "@/components/auth/captcha-challenge";

/*
  Paket 5.4.1 (M3): the Turnstile widget on the sign-in page.

  The frontend specs run in a node environment (`vitest.config.ts`), so the
  static markup and the loader are covered here, and the real browser path —
  challenge appears after repeated failures, a solved token signs the user in —
  is covered by the E2E spec 48. What must not regress:

    * nothing third-party loads before the challenge is actually asked for, and
      then it loads explicitly (`?render=explicit`, one script, no auto-scan);
    * a missing widget shows a sentence and a retry button, never a mute box.
*/
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "bs", resolvedLanguage: "bs" },
  }),
}));

/**
 * The loader touches three globals. They are read and written through this
 * optional-property view, so the spec can install a stub and remove it again
 * without pretending to be a full DOM.
 */
const globalScope = globalThis as unknown as {
  window?: unknown;
  document?: unknown;
  turnstile?: unknown;
};

afterEach(() => {
  delete globalScope.window;
  delete globalScope.document;
  delete globalScope.turnstile;
});

describe("CaptchaChallenge", () => {
  it("renders the title, the hint and the widget container", () => {
    const html = renderToStaticMarkup(
      <CaptchaChallenge siteKey="1x00000000000000000000AA" onToken={() => {}} />,
    );
    expect(html).toContain("session.captchaTitle");
    expect(html).toContain("session.captchaHint");
    expect(html).toContain('data-testid="turnstile-widget"');
    // No load error yet, so no retry button and no failure text.
    expect(html).not.toContain("session.captchaUnavailable");
    expect(html).not.toContain("session.captchaRetry");
  });

  it("uses the explicit-render script, so nothing loads before the challenge", () => {
    expect(turnstileScriptUrl).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    );
  });

  it("reuses an already loaded API instead of injecting a second script", async () => {
    const api = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() };
    globalScope.turnstile = api;
    globalScope.document = { createElement: vi.fn() } as unknown as Document;

    await expect(loadTurnstileScript()).resolves.toBe(api);
  });

  it("injects the script once and resolves with the API it exposes", async () => {
    const api = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() };
    const scripts: Array<Record<string, unknown>> = [];
    // Two members are all the loader touches; the cast keeps the stub honest
    // without pulling a DOM into the node test environment.
    const documentStub = {
      createElement: () => {
        const element: Record<string, unknown> = { dataset: {} };
        scripts.push(element);
        return element;
      },
      head: {
        appendChild: () => {
          globalScope.turnstile = api;
          (scripts[0]?.onload as (() => void) | undefined)?.();
        },
      },
    } as unknown as Document;
    globalScope.document = documentStub;

    await expect(loadTurnstileScript()).resolves.toBe(api);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.src).toBe(turnstileScriptUrl);
    expect(scripts[0]?.async).toBe(true);
    expect(scripts[0]?.defer).toBe(true);
  });

  it("rejects when the script fails to load, which is what shows the retry button", async () => {
    const scripts: Array<Record<string, unknown>> = [];
    globalScope.document = {
      createElement: () => {
        const element: Record<string, unknown> = { dataset: {} };
        scripts.push(element);
        return element;
      },
      head: {
        appendChild: () => (scripts[0]?.onerror as (() => void) | undefined)?.(),
      },
    } as unknown as Document;

    await expect(loadTurnstileScript()).rejects.toThrow("turnstile script failed to load");
  });
});

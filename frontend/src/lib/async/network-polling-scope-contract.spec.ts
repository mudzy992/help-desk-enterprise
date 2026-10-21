import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const networkPollers = [
  "lib/status/use-status-overview-data.ts",
  "lib/ops/use-ops-health-overview.ts",
  "lib/notifications/use-inbox-notifications.ts",
  "lib/teams/use-teams-simulator.ts",
  "components/on-call/on-call-header-indicator.tsx",
  "components/privacy/privacy-exports-panel.tsx",
  "components/privacy/privacy-anonymization-panel.tsx",
] as const;

describe("network polling scope contract", () => {
  it.each(networkPollers)("uses the shared visibility-aware policy in %s", (path) => {
    const contents = source(path);
    expect(contents).toContain("useVisibilityAwarePolling");
    expect(contents).not.toContain("window.setInterval");
  });

  it("does not migrate local elapsed-time clocks into the network policy", () => {
    expect(source("components/layout/active-timer-indicator.tsx")).toContain("window.setInterval");
    expect(source("components/tickets/ticket-time-tracking-elapsed.tsx")).toContain(
      "window.setInterval",
    );
  });
});

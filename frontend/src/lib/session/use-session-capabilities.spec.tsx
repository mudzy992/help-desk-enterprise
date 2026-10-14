// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { getCurrentSession, type CurrentSessionResponse } from "@/services/session-api";
import { writeStoredSession } from "@/services/session-store";

vi.mock("@/services/session-api", () => ({
  getCurrentSession: vi.fn(),
}));

const principal = {
  subjectId: "user-1",
  email: "agent@example.test",
  displayName: "Agent",
  isLocalOnly: true,
};

const session: CurrentSessionResponse = {
  principal,
  isSuperAdmin: false,
  roleKeys: ["AGENT"],
  permissionKeys: ["ticket.read"],
  organizationalUnitId: null,
  organizationalUnitName: null,
};

function Consumer({ label }: { readonly label: string }) {
  const capabilities = useSessionCapabilities();
  return (
    <p>
      {label}:{capabilities.isLoading ? "loading" : capabilities.session ? "ready" : "none"}
    </p>
  );
}

describe("useSessionCapabilities", () => {
  beforeEach(() => {
    window.localStorage.clear();
    writeStoredSession({ expiresAt: Date.now() + 3_600_000, principal });
    vi.mocked(getCurrentSession).mockReset();
    vi.mocked(getCurrentSession).mockResolvedValue(session);
  });

  afterEach(() => {
    cleanup();
  });

  it("shares one /auth/session request between all consumers (A3)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Consumer label="shell" />
        <Consumer label="sidebar" />
        <Consumer label="header" />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText("header:ready")).toBeTruthy());
    expect(getCurrentSession).toHaveBeenCalledTimes(1);
  });
});

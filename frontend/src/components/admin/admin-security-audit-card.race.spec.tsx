// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSecurityAuditCard } from "@/components/admin/admin-security-audit-card";
import {
  listSecurityAuditLog,
  type SecurityAuditLogResult,
  type SecurityAuditLogRow,
} from "@/services/security-audit-log-api";
import { listUsersSummaryPage, type UserSummary } from "@/services/users-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));
vi.mock("@/components/ui/scroll-region", () => ({
  ScrollRegion: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/services/security-audit-log-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/security-audit-log-api")>();
  return { ...actual, listSecurityAuditLog: vi.fn() };
});
vi.mock("@/services/users-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/users-api")>();
  return { ...actual, listUsersSummaryPage: vi.fn() };
});

const row = (id: string): SecurityAuditLogRow => ({
  id,
  createdAt: "2026-10-19T00:00:00.000Z",
  action: "auth.future_action",
  entityType: "future_entity",
  entityId: `entity-${id}`,
  actorUserId: `actor-${id}`,
  actorDisplayName: null,
  organizationalUnitId: null,
  requestId: null,
  previousHash: null,
  hash: `hash-${id}`,
  metadata: {},
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("AdminSecurityAuditCard async contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listUsersSummaryPage).mockResolvedValue({ items: [], total: 0 });
  });
  afterEach(cleanup);

  it("allows only the latest filter request to render", async () => {
    const stale = deferred<SecurityAuditLogResult>();
    const latest = deferred<SecurityAuditLogResult>();
    vi.mocked(listSecurityAuditLog)
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(latest.promise);
    render(<AdminSecurityAuditCard canView />);
    fireEvent.change(screen.getByLabelText("admin.security.filterAction"), {
      target: { value: "auth.mfa_failed" },
    });

    await act(async () => {
      latest.resolve({ items: [row("latest")], nextCursor: null });
      await latest.promise;
    });
    expect(screen.getByTitle("entity-latest")).toBeTruthy();
    expect(screen.getByText("admin.security.unknownAction")).toBeTruthy();

    await act(async () => {
      stale.resolve({ items: [row("stale")], nextCursor: null });
      await stale.promise;
    });
    expect(screen.queryByTitle("entity-stale")).toBeNull();
  });

  it("invalidates an in-flight journal request when access is revoked", async () => {
    const pending = deferred<SecurityAuditLogResult>();
    vi.mocked(listSecurityAuditLog).mockReturnValueOnce(pending.promise);
    const { rerender } = render(<AdminSecurityAuditCard canView />);
    rerender(<AdminSecurityAuditCard canView={false} />);

    await act(async () => {
      pending.resolve({ items: [row("forbidden")], nextCursor: null });
      await pending.promise;
    });
    expect(screen.queryByTitle("entity-forbidden")).toBeNull();
    expect(screen.getByText("admin.security.forbiddenTitle")).toBeTruthy();
  });

  it("does not restore stale user matches after the search is cleared", async () => {
    vi.mocked(listSecurityAuditLog).mockResolvedValue({ items: [], nextCursor: null });
    const search = deferred<{ items: UserSummary[]; total: number }>();
    vi.mocked(listUsersSummaryPage).mockReturnValueOnce(search.promise);
    render(<AdminSecurityAuditCard canView />);
    const input = screen.getByLabelText("admin.security.filterUser");
    fireEvent.change(input, { target: { value: "Al" } });
    await waitFor(() => expect(listUsersSummaryPage).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "" } });

    await act(async () => {
      search.resolve({
        total: 1,
        items: [{ id: "user-1", displayName: "Alice", email: "alice@example.test" } as UserSummary],
      });
      await search.promise;
    });
    expect(screen.queryByText("Alice")).toBeNull();
  });

  it("keeps the loaded rows visible when load-more fails", async () => {
    vi.mocked(listSecurityAuditLog)
      .mockResolvedValueOnce({ items: [row("first")], nextCursor: "cursor-1" })
      .mockRejectedValueOnce(new Error("offline"));
    render(<AdminSecurityAuditCard canView />);
    await screen.findByTitle("entity-first");
    fireEvent.click(screen.getByRole("button", { name: "admin.security.auditLoadMore" }));

    await screen.findByText("admin.ops.errorGeneric");
    expect(screen.getByTitle("entity-first")).toBeTruthy();
  });

  it("drops an old load-more page after a filter changes", async () => {
    const oldPage = deferred<SecurityAuditLogResult>();
    const replacement = deferred<SecurityAuditLogResult>();
    vi.mocked(listSecurityAuditLog)
      .mockResolvedValueOnce({ items: [row("first")], nextCursor: "cursor-1" })
      .mockReturnValueOnce(oldPage.promise)
      .mockReturnValueOnce(replacement.promise);
    render(<AdminSecurityAuditCard canView />);
    await screen.findByTitle("entity-first");
    fireEvent.click(screen.getByRole("button", { name: "admin.security.auditLoadMore" }));
    fireEvent.change(screen.getByLabelText("admin.security.filterAction"), {
      target: { value: "auth.mfa_failed" },
    });

    await act(async () => {
      replacement.resolve({ items: [row("replacement")], nextCursor: null });
      await replacement.promise;
    });
    await act(async () => {
      oldPage.resolve({ items: [row("old-page")], nextCursor: null });
      await oldPage.promise;
    });
    expect(screen.getByTitle("entity-replacement")).toBeTruthy();
    expect(screen.queryByTitle("entity-old-page")).toBeNull();
  });
});

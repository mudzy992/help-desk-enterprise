// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAuditLogCard } from "@/components/admin/admin-audit-log-card";
import { ApiError } from "@/services/api";
import {
  listAuditLogs,
  type AuditLogListResult,
  type AuditLogListRow,
} from "@/services/audit-log-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      key === "errors.requestId" ? `${key}:${String(values?.requestId)}` : key,
    i18n: { language: "bs" },
  }),
}));
vi.mock("@/components/ui/scroll-region", () => ({
  ScrollRegion: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/services/audit-log-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/audit-log-api")>();
  return { ...actual, listAuditLogs: vi.fn() };
});

const row = (id: string): AuditLogListRow => ({
  id,
  createdAt: "2026-10-19T00:00:00.000Z",
  action: "unknown.action",
  entityType: "unknown.entity",
  entityId: `entity-${id}`,
  actorUserId: `actor-${id}`,
  actorDisplayName: `Actor ${id}`,
  organizationalUnitId: null,
  requestId: null,
  previousHash: null,
  hash: `hash-${id}`,
  metadata: {},
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("AdminAuditLogCard", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("allows only the latest organizational-unit request to render", async () => {
    const stale = deferred<AuditLogListResult>();
    const latest = deferred<AuditLogListResult>();
    vi.mocked(listAuditLogs).mockReturnValueOnce(stale.promise).mockReturnValueOnce(latest.promise);
    const { rerender } = render(<AdminAuditLogCard canView organizationalUnitId="unit-a" />);
    rerender(<AdminAuditLogCard canView organizationalUnitId="unit-b" />);

    await act(async () => {
      latest.resolve({ items: [row("latest")], nextCursor: null });
      await latest.promise;
    });
    expect(screen.getByText("entity-latest")).toBeTruthy();

    await act(async () => {
      stale.resolve({ items: [row("stale")], nextCursor: null });
      await stale.promise;
    });
    expect(screen.queryByText("entity-stale")).toBeNull();
  });

  it("invalidates an in-flight answer when view access is revoked", async () => {
    const pending = deferred<AuditLogListResult>();
    vi.mocked(listAuditLogs).mockReturnValueOnce(pending.promise);
    const { rerender } = render(<AdminAuditLogCard canView organizationalUnitId="unit-a" />);
    rerender(<AdminAuditLogCard canView={false} organizationalUnitId="unit-a" />);

    await act(async () => {
      pending.resolve({ items: [row("forbidden")], nextCursor: null });
      await pending.promise;
    });
    expect(screen.queryByText("entity-forbidden")).toBeNull();
    expect(listAuditLogs).toHaveBeenCalledTimes(1);
  });

  it("drops load-more data when the organizational-unit scope changes", async () => {
    const loadMore = deferred<AuditLogListResult>();
    const replacement = deferred<AuditLogListResult>();
    vi.mocked(listAuditLogs)
      .mockResolvedValueOnce({ items: [row("first")], nextCursor: "cursor-1" })
      .mockReturnValueOnce(loadMore.promise)
      .mockReturnValueOnce(replacement.promise);
    const { rerender } = render(<AdminAuditLogCard canView organizationalUnitId="unit-a" />);
    await screen.findByText("entity-first");
    fireEvent.click(screen.getByRole("button", { name: "admin.ops.auditLogLoadMore" }));
    rerender(<AdminAuditLogCard canView organizationalUnitId="unit-b" />);

    await act(async () => {
      replacement.resolve({ items: [row("replacement")], nextCursor: null });
      await replacement.promise;
    });
    await act(async () => {
      loadMore.resolve({ items: [row("old-page")], nextCursor: null });
      await loadMore.promise;
    });
    expect(screen.getByText("entity-replacement")).toBeTruthy();
    expect(screen.queryByText("entity-old-page")).toBeNull();
  });

  it("renders mapped errors with the server request id", async () => {
    vi.mocked(listAuditLogs).mockRejectedValue(
      new ApiError(500, "FAILED", "failed", "audit-request"),
    );
    render(<AdminAuditLogCard canView organizationalUnitId="unit-a" />);
    expect(await screen.findByText("errors.requestId:audit-request")).toBeTruthy();
  });
});

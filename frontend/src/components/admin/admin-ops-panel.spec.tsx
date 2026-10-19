// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminOpsPanel } from "@/components/admin/admin-ops-panel";
import {
  listOrganizationalUnitTree,
  type OrganizationalUnitTreeNode,
} from "@/services/organizational-units-api";

let canAudit = true;

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => ({ session: null, hasPermission: vi.fn(), hasRole: vi.fn() }),
}));
vi.mock("@/lib/session/admin-access", () => ({
  adminOpsVisibility: () => ({
    health: false,
    manageAlerts: false,
    auditExport: canAudit,
    supportBundle: false,
    securityMetrics: false,
    integrationQueue: false,
    teams: false,
  }),
}));
vi.mock("@/services/organizational-units-api", () => ({ listOrganizationalUnitTree: vi.fn() }));
vi.mock("@/components/admin/admin-audit-log-card", () => ({
  AdminAuditLogCard: ({ organizationalUnitId }: { organizationalUnitId: string }) => (
    <div data-testid="audit-unit">{organizationalUnitId}</div>
  ),
}));
vi.mock("@/components/admin/admin-audit-export-card", () => ({
  AdminAuditExportCard: () => null,
}));
vi.mock("@/components/admin/admin-support-bundle-card", () => ({
  AdminSupportBundleCard: () => null,
}));
vi.mock("@/components/admin/admin-security-metrics-card", () => ({
  AdminSecurityMetricsCard: () => null,
}));
vi.mock("@/components/admin/ops-health-card", () => ({ OpsHealthCard: () => null }));
vi.mock("@/components/queue/integration-queue-card", () => ({ IntegrationQueueCard: () => null }));

const unit = (id: string, name = id): OrganizationalUnitTreeNode => ({
  id,
  name,
  ouPath: name,
  children: [],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("AdminOpsPanel organizational-unit scope", () => {
  beforeEach(() => {
    canAudit = true;
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("selects the first available unit and forwards an explicit selection to the audit card", async () => {
    vi.mocked(listOrganizationalUnitTree).mockResolvedValueOnce([unit("a"), unit("b")]);
    render(<AdminOpsPanel />);

    const select = (await screen.findByLabelText(
      "admin.ops.organizationalUnit",
    )) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("a"));
    expect(screen.getByTestId("audit-unit").textContent).toBe("a");

    fireEvent.change(select, { target: { value: "b" } });
    expect(screen.getByTestId("audit-unit").textContent).toBe("b");
  });

  it("ignores an older unit answer after access is revoked and restored", async () => {
    const stale = deferred<readonly OrganizationalUnitTreeNode[]>();
    const latest = deferred<readonly OrganizationalUnitTreeNode[]>();
    vi.mocked(listOrganizationalUnitTree)
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(latest.promise);
    const { rerender } = render(<AdminOpsPanel />);

    canAudit = false;
    rerender(<AdminOpsPanel />);
    expect(screen.queryByLabelText("admin.ops.organizationalUnit")).toBeNull();
    canAudit = true;
    rerender(<AdminOpsPanel />);

    await act(async () => {
      latest.resolve([unit("latest")]);
      await latest.promise;
    });
    expect((screen.getByLabelText("admin.ops.organizationalUnit") as HTMLSelectElement).value).toBe(
      "latest",
    );

    await act(async () => {
      stale.resolve([unit("stale")]);
      await stale.promise;
    });
    expect((screen.getByLabelText("admin.ops.organizationalUnit") as HTMLSelectElement).value).toBe(
      "latest",
    );
  });

  it("does not request organizational units without audit access", () => {
    canAudit = false;
    render(<AdminOpsPanel />);
    expect(listOrganizationalUnitTree).not.toHaveBeenCalled();
  });
});

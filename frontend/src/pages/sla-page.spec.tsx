// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SlaPage } from "@/pages/sla-page";

const data = vi.hoisted(() => ({
  profiles: [{ id: "p-1", name: "Profile" }],
  calendars: [],
  rules: [],
  changes: [],
  exposure: {},
  compliance: null,
  selectedId: "p-1",
  selected: { id: "p-1" },
  detailProfileId: "p-1",
  detailReady: true,
  isCreating: false,
  isLoading: false,
  isDetailLoading: false,
  isComplianceLoading: false,
  baseError: null,
  detailError: null,
  complianceError: null,
  mutationError: null,
  errorKey: null,
  setSelectedId: vi.fn(),
  startCreate: vi.fn(),
  clearSelection: vi.fn(),
  load: vi.fn(),
  reloadSelected: vi.fn(),
  reloadCompliance: vi.fn(),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => ({
    session: { organizationalUnitId: "ou-1" },
    isLoading: false,
    hasPermission: () => true,
  }),
}));
vi.mock("@/services/organizational-units-api", () => ({
  listOrganizationalUnitTree: vi
    .fn()
    .mockResolvedValue([{ id: "ou-1", name: "One", ouPath: "One", children: [] }]),
}));
vi.mock("@/lib/sla/use-sla-page-data", () => ({ useSlaPageData: () => data }));
vi.mock("@/lib/sla/use-sla-page-mutations", () => ({
  useSlaPageMutations: () => ({
    isSubmitting: false,
    saveProfile: vi.fn(),
    saveRule: vi.fn(),
    removeRule: vi.fn(),
    removeProfile: vi.fn(),
  }),
}));
vi.mock("@/lib/realtime/use-admin-config-live-refresh", () => ({
  useAdminConfigLiveRefresh: () => ({ pending: false, refreshNow: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("@/components/admin/admin-config-changed-banner", () => ({
  AdminConfigChangedBanner: () => null,
}));
vi.mock("@/components/layout/page-header", () => ({
  brandCrumb: "brand",
  PageHeader: ({ actions }: { actions: unknown }) => <header>{actions as never}</header>,
}));
vi.mock("@/components/sla/priority-matrix-panel", () => ({
  PriorityMatrixPanel: () => <div data-testid="matrix" />,
}));
vi.mock("@/components/sla/sla-calendars-panel", () => ({
  SlaCalendarsPanel: () => <div data-testid="calendars" />,
}));
vi.mock("@/components/sla/sla-profile-list", () => ({
  SlaProfileList: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <button onClick={() => onSelect("p-1")}>select-profile</button>
  ),
}));
vi.mock("@/components/sla/sla-profile-detail", () => ({
  SlaProfileDetail: () => <div data-testid="profile-detail" />,
}));
vi.mock("@/components/sla/sla-compliance-card", () => ({
  SlaComplianceCard: () => <div data-testid="compliance" />,
}));
vi.mock("@/components/ui/tabs", () => ({
  UnderlineTabs: ({
    items,
    onChange,
  }: {
    items: { key: string }[];
    onChange: (key: string) => void;
  }) => (
    <nav aria-label="sla-tabs">
      {items.map((item) => (
        <button key={item.key} onClick={() => onChange(item.key)}>
          {item.key}
        </button>
      ))}
    </nav>
  ),
}));

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}
function renderPage(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SlaPage />
      <Location />
    </MemoryRouter>,
  );
}
afterEach(cleanup);

describe("SlaPage URL and structural contract", () => {
  it("renders deep-linked matrix and returns without losing scope", async () => {
    renderPage("/sla?view=matrix&organizationalUnitId=ou-1&profileId=p-1");
    expect(screen.getByTestId("matrix")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "sla.backToProfiles" }));
    expect(screen.getByTestId("location").textContent).toContain("organizationalUnitId=ou-1");
    expect(screen.getByTestId("location").textContent).toContain("profileId=p-1");
  });

  it("switches to compliance through the URL-backed accessible tabs", async () => {
    renderPage("/sla?organizationalUnitId=ou-1&profileId=p-1");
    await waitFor(() => expect(screen.getByRole("navigation", { name: "sla-tabs" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "compliance" }));
    expect(screen.getByTestId("location").textContent).toContain("panel=compliance");
    expect(screen.getByTestId("compliance")).toBeTruthy();
  });
});

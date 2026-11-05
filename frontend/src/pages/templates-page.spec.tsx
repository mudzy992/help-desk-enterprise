// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TemplatesPage } from "@/pages/templates-page";
import { ApiError } from "@/services/api";
import {
  deleteResponseTemplate,
  listManagedTemplates,
  type ResponseTemplate,
} from "@/services/templates-api";

const state = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("@/i18n/use-locale", () => ({ useLocale: () => ({ locale: "bs" }) }));
vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => ({
    session: { isSuperAdmin: true },
    hasPermission: () => true,
  }),
}));
vi.mock("@/lib/realtime/use-admin-config-live-refresh", () => ({
  useAdminConfigLiveRefresh: () => ({ pending: false, refreshNow: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("@/components/admin/admin-config-changed-banner", () => ({
  AdminConfigChangedBanner: () => null,
}));
vi.mock("@/components/ui/scroll-region", () => ({
  ScrollRegion: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? (
      <button type="button" data-testid="confirm-delete" onClick={onConfirm}>
        confirm-delete
      </button>
    ) : null,
}));
vi.mock("@/services/templates-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/templates-api")>();
  return {
    ...actual,
    deleteResponseTemplate: vi.fn(),
    listManagedTemplates: vi.fn(),
  };
});

const template = (overrides: Partial<ResponseTemplate> = {}): ResponseTemplate => ({
  id: "template-1",
  name: "Initial personal template",
  bodyBs: "Initial response",
  bodyEn: null,
  kind: "REPLY",
  tags: [],
  isActive: true,
  ownership: "personal",
  serviceIds: [],
  categoryIds: [],
  groupIds: [],
  variables: [],
  usageCount: 0,
  lastUsedAt: null,
  updatedAt: "2026-01-02T03:04:05.000Z",
  canEdit: true,
  ...overrides,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/templates?tab=mine"]}>
      <TemplatesPage />
    </MemoryRouter>,
  );
}

describe("TemplatesPage revision handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("sends the listed revision and reloads the list after a delete conflict", async () => {
    const latest = template({
      name: "Latest personal template",
      updatedAt: "2026-01-03T03:04:05.000Z",
    });
    vi.mocked(listManagedTemplates)
      .mockResolvedValueOnce([template()])
      .mockResolvedValueOnce([latest]);
    vi.mocked(deleteResponseTemplate).mockRejectedValueOnce(
      new ApiError(409, "TEMPLATE_VERSION_CONFLICT", "stale"),
    );

    renderPage();
    await screen.findByText("Initial personal template");
    fireEvent.click(screen.getByRole("button", { name: "templates.actions.delete" }));
    fireEvent.click(screen.getByTestId("confirm-delete"));

    await waitFor(() => {
      expect(deleteResponseTemplate).toHaveBeenCalledWith("personal", "template-1", {
        reason: "",
        expectedUpdatedAt: "2026-01-02T03:04:05.000Z",
      });
      expect(listManagedTemplates).toHaveBeenCalledTimes(2);
    });
    await screen.findByText("Latest personal template");
    expect(state.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "templates.errors.TEMPLATE_VERSION_CONFLICT" }),
    );
  });
});

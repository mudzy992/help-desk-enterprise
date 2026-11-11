// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResponseTemplateEditorPage } from "@/pages/response-template-editor-page";
import { ApiError } from "@/services/api";
import { listGroups } from "@/services/groups-api";
import { listServices } from "@/services/service-catalog-api";
import { listServiceCategories } from "@/services/service-categories-api";
import {
  getResponseTemplate,
  previewResponseTemplate,
  updateResponseTemplate,
  type ResponseTemplate,
} from "@/services/templates-api";

const state = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("@/lib/realtime/use-admin-config-live-refresh", () => ({
  useAdminConfigLiveRefresh: () => ({ pending: false, refreshNow: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("@/components/admin/admin-config-changed-banner", () => ({
  AdminConfigChangedBanner: () => null,
}));
vi.mock("@/components/templates/scope-multi-select", () => ({ ScopeMultiSelect: () => null }));
vi.mock("@/components/templates/variable-palette", () => ({ VariablePalette: () => null }));
vi.mock("@/services/groups-api", () => ({ listGroups: vi.fn() }));
vi.mock("@/services/service-catalog-api", () => ({ listServices: vi.fn() }));
vi.mock("@/services/service-categories-api", () => ({ listServiceCategories: vi.fn() }));
vi.mock("@/services/templates-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/templates-api")>();
  return {
    ...actual,
    getResponseTemplate: vi.fn(),
    previewResponseTemplate: vi.fn(),
    updateResponseTemplate: vi.fn(),
  };
});

const template = (overrides: Partial<ResponseTemplate> = {}): ResponseTemplate => ({
  id: "template-1",
  name: "Initial template",
  bodyBs: "Initial response",
  bodyEn: null,
  kind: "REPLY",
  tags: [],
  isActive: true,
  ownership: "shared",
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

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={["/admin/templates/template-1"]}>
      <Routes>
        <Route path="/admin/templates/:templateId" element={<ResponseTemplateEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResponseTemplateEditorPage revision handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listGroups).mockResolvedValue([]);
    vi.mocked(listServices).mockResolvedValue([]);
    vi.mocked(listServiceCategories).mockResolvedValue([]);
    vi.mocked(previewResponseTemplate).mockResolvedValue({
      templateId: null,
      text: "Preview",
      locale: "bs",
      missing: [],
      unknown: [],
    });
  });
  afterEach(cleanup);

  it("sends the loaded updatedAt and fetches the latest row after a conflict without discarding the draft", async () => {
    const latest = template({
      name: "Latest server template",
      bodyBs: "Latest server response",
      updatedAt: "2026-01-03T03:04:05.000Z",
    });
    vi.mocked(getResponseTemplate).mockResolvedValueOnce(template()).mockResolvedValueOnce(latest);
    vi.mocked(updateResponseTemplate).mockRejectedValueOnce(
      new ApiError(409, "TEMPLATE_VERSION_CONFLICT", "stale"),
    );

    renderEditor();
    await screen.findByDisplayValue("Initial template");
    fireEvent.change(screen.getByTestId("template-name"), { target: { value: "My draft" } });
    fireEvent.change(screen.getByTestId("template-body-bs"), {
      target: { value: "Draft response" },
    });
    fireEvent.change(screen.getByTestId("template-reason"), {
      target: { value: "A meaningful update" },
    });
    fireEvent.click(screen.getByTestId("template-save"));

    await waitFor(() => {
      expect(updateResponseTemplate).toHaveBeenCalledWith("shared", "template-1", {
        name: "My draft",
        kind: "REPLY",
        bodyBs: "Draft response",
        bodyEn: null,
        tags: [],
        isActive: true,
        serviceIds: [],
        categoryIds: [],
        groupIds: [],
        reason: "A meaningful update",
        expectedUpdatedAt: "2026-01-02T03:04:05.000Z",
      });
    });
    await screen.findByRole("button", { name: "templates.editor.loadLatest" });
    expect(getResponseTemplate).toHaveBeenCalledTimes(2);
    expect((screen.getByTestId("template-name") as HTMLInputElement).value).toBe("My draft");

    fireEvent.click(screen.getByRole("button", { name: "templates.editor.loadLatest" }));
    await waitFor(() => {
      expect((screen.getByTestId("template-name") as HTMLInputElement).value).toBe(
        "Latest server template",
      );
      expect(screen.queryByText("templates.errors.TEMPLATE_VERSION_CONFLICT")).toBeNull();
    });
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybookEditorPage } from "@/pages/playbook-editor-page";
import { ApiError } from "@/services/api";
import { listKnowledgeArticles } from "@/services/knowledge-base-api";
import { listServices } from "@/services/service-catalog-api";
import { listServiceCategories } from "@/services/service-categories-api";
import {
  getPlaybook,
  listManagedTemplates,
  updatePlaybook,
  type Playbook,
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
vi.mock("@/components/templates/playbook-steps-editor", () => ({
  PlaybookStepsEditor: () => null,
}));
vi.mock("@/services/knowledge-base-api", () => ({ listKnowledgeArticles: vi.fn() }));
vi.mock("@/services/service-catalog-api", () => ({ listServices: vi.fn() }));
vi.mock("@/services/service-categories-api", () => ({ listServiceCategories: vi.fn() }));
vi.mock("@/services/templates-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/templates-api")>();
  return {
    ...actual,
    getPlaybook: vi.fn(),
    listManagedTemplates: vi.fn(),
    updatePlaybook: vi.fn(),
  };
});

const playbook = (overrides: Partial<Playbook> = {}): Playbook => ({
  id: "playbook-1",
  name: "Initial playbook",
  description: null,
  isActive: true,
  version: 1,
  serviceIds: [],
  categoryIds: [],
  steps: [
    {
      stepKey: "step-1",
      title: "Initial checklist step",
      instructions: null,
      required: true,
      knowledgeArticleId: null,
      responseTemplateId: null,
    },
  ],
  activeTicketCount: 0,
  updatedAt: "2026-01-02T03:04:05.000Z",
  canEdit: true,
  ...overrides,
});

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={["/admin/templates/playbooks/playbook-1"]}>
      <Routes>
        <Route path="/admin/templates/playbooks/:playbookId" element={<PlaybookEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PlaybookEditorPage revision handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listKnowledgeArticles).mockResolvedValue([]);
    vi.mocked(listServices).mockResolvedValue([]);
    vi.mocked(listServiceCategories).mockResolvedValue([]);
    vi.mocked(listManagedTemplates).mockResolvedValue([]);
  });
  afterEach(cleanup);

  it("sends the loaded updatedAt and fetches the latest row after a conflict without discarding the draft", async () => {
    const latest = playbook({
      name: "Latest server playbook",
      version: 2,
      updatedAt: "2026-01-03T03:04:05.000Z",
      steps: [
        {
          stepKey: "step-2",
          title: "Latest server step",
          instructions: null,
          required: true,
          knowledgeArticleId: null,
          responseTemplateId: null,
        },
      ],
    });
    vi.mocked(getPlaybook).mockResolvedValueOnce(playbook()).mockResolvedValueOnce(latest);
    vi.mocked(updatePlaybook).mockRejectedValueOnce(
      new ApiError(409, "PLAYBOOK_VERSION_CONFLICT", "stale"),
    );

    renderEditor();
    await screen.findByDisplayValue("Initial playbook");
    fireEvent.change(screen.getByTestId("playbook-name"), { target: { value: "My draft" } });
    fireEvent.change(screen.getByTestId("playbook-reason"), {
      target: { value: "A meaningful update" },
    });
    fireEvent.click(screen.getByTestId("playbook-save"));

    await waitFor(() => {
      expect(updatePlaybook).toHaveBeenCalledWith("playbook-1", {
        name: "My draft",
        description: null,
        isActive: true,
        serviceIds: [],
        categoryIds: [],
        reason: "A meaningful update",
        steps: [
          {
            stepKey: "step-1",
            title: "Initial checklist step",
            instructions: null,
            required: true,
            knowledgeArticleId: null,
            responseTemplateId: null,
          },
        ],
        expectedUpdatedAt: "2026-01-02T03:04:05.000Z",
      });
    });
    await screen.findByRole("button", { name: "templates.editor.loadLatest" });
    expect(getPlaybook).toHaveBeenCalledTimes(2);
    expect((screen.getByTestId("playbook-name") as HTMLInputElement).value).toBe("My draft");

    fireEvent.click(screen.getByRole("button", { name: "templates.editor.loadLatest" }));
    await waitFor(() => {
      expect((screen.getByTestId("playbook-name") as HTMLInputElement).value).toBe(
        "Latest server playbook",
      );
      expect(screen.queryByText("templates.errors.PLAYBOOK_VERSION_CONFLICT")).toBeNull();
    });
  });
});

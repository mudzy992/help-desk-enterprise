// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailTemplatesPage } from "@/pages/email-templates-page";
import { ApiError } from "@/services/api";
import { getEmailTemplates, type EmailTemplatesOverview } from "@/services/email-templates-api";

const state = vi.hoisted(() => ({
  canWritePolicy: true,
  editorCanWrite: undefined as boolean | undefined,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { requestId?: string }) => values?.requestId ?? key,
  }),
}));
vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => ({ isSuperAdmin: true }),
}));
vi.mock("@/lib/session/admin-access", () => ({ canWriteSettings: () => true }));
vi.mock("@/lib/settings/use-admin-module-read-only", () => ({
  adminReadOnlyModuleKeys: { settings: "settings" },
  useAdminModuleReadOnly: () => ({
    canWrite: state.canWritePolicy,
    isLocked: !state.canWritePolicy,
    errorKey: null,
    requestId: null,
    retry: vi.fn(),
  }),
}));
vi.mock("@/components/settings/email-templates-editor", () => ({
  EmailTemplatesEditor: ({ canWrite }: { canWrite: boolean }) => {
    state.editorCanWrite = canWrite;
    return <div>email-editor</div>;
  },
}));
vi.mock("@/services/email-templates-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/email-templates-api")>();
  return { ...actual, getEmailTemplates: vi.fn() };
});

const overview = { delivery: { publicUrlConfigured: true } } as EmailTemplatesOverview;
function page() {
  return render(
    <MemoryRouter>
      <EmailTemplatesPage />
    </MemoryRouter>,
  );
}

describe("EmailTemplatesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.canWritePolicy = true;
    state.editorCanWrite = undefined;
  });
  afterEach(cleanup);

  it("shows request id on initial failure and retries successfully", async () => {
    vi.mocked(getEmailTemplates)
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "offline", "email-request"))
      .mockResolvedValueOnce(overview);
    page();
    await waitFor(() => expect(screen.getByText("email-request")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "ui.retry" }));
    await waitFor(() => expect(screen.getByText("email-editor")).toBeTruthy());
    expect(screen.queryByText("email-request")).toBeNull();
  });

  it("keeps the editor readable but write-disabled when policy is locked", async () => {
    state.canWritePolicy = false;
    vi.mocked(getEmailTemplates).mockResolvedValue(overview);
    page();
    await screen.findByText("email-editor");
    expect(state.editorCanWrite).toBe(false);
  });
});

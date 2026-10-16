// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupChecklistCard } from "@/components/dashboard/setup-checklist-card";
import {
  dismissSetupChecklist,
  loadSetupChecklist,
  type SetupChecklistStatus,
} from "@/services/setup-checklist-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/setup-checklist-api", () => ({
  loadSetupChecklist: vi.fn(),
  dismissSetupChecklist: vi.fn(),
}));

/*
  F6.3: the dashboard widget. What matters is what it refuses to do — it never
  keeps its own list (the backend decides what is still open), it disappears when
  there is nothing to do or when an administrator hid it, and a failed read stays
  quiet instead of adding a second error to the dashboard.
*/

function status(overrides: Partial<SetupChecklistStatus> = {}): SetupChecklistStatus {
  return {
    dismissedAt: null,
    items: [
      {
        key: "step.smtp",
        kind: "step",
        targetKey: "smtp",
        titleKey: "dashboard.setupChecklist.item.smtp",
      },
      {
        key: "recommendation.private.auth.mfa.requiredForAdmins",
        kind: "recommendation",
        targetKey: "private.auth.mfa.requiredForAdmins",
        titleKey: "install.security.recommendations.mfaAdmins.title",
        helpKey: "install.security.recommendations.mfaAdmins.help",
      },
    ],
    ...overrides,
  };
}

function renderCard() {
  return render(
    <MemoryRouter>
      <SetupChecklistCard />
    </MemoryRouter>,
  );
}

describe("SetupChecklistCard", () => {
  beforeEach(() => {
    vi.mocked(dismissSetupChecklist).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.mocked(loadSetupChecklist).mockReset();
  });

  it("lists the open items with a link to the screen that fixes each one", async () => {
    vi.mocked(loadSetupChecklist).mockResolvedValue(status());

    renderCard();

    expect(await screen.findByText("dashboard.setupChecklist.item.smtp")).toBeTruthy();
    // The step line falls back to the hint when the item has no sentence of its own.
    expect(screen.getByText("dashboard.setupChecklist.itemHint")).toBeTruthy();
    expect(screen.getByText("install.security.recommendations.mfaAdmins.title")).toBeTruthy();
    expect(screen.getByText("install.security.recommendations.mfaAdmins.help")).toBeTruthy();

    const links = screen
      .getAllByText("dashboard.setupChecklist.goTo")
      .map((node) => node.closest("a"));
    expect(links[0]?.getAttribute("href")).toBe("/admin?tab=settings");
    expect(links[1]?.getAttribute("href")).toBe("/admin?tab=security");
  });

  it("hides itself when the administrator dismissed it", async () => {
    vi.mocked(loadSetupChecklist).mockResolvedValue(
      status({ dismissedAt: "2026-10-15T09:00:00.000Z" }),
    );

    renderCard();

    await waitFor(() => expect(vi.mocked(loadSetupChecklist)).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("dashboard.setupChecklist.title")).toBeNull();
  });

  it("hides itself when there is nothing left to do", async () => {
    vi.mocked(loadSetupChecklist).mockResolvedValue(status({ items: [] }));

    renderCard();

    await waitFor(() => expect(vi.mocked(loadSetupChecklist)).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("dashboard.setupChecklist.title")).toBeNull();
  });

  it("stays quiet when the read fails", async () => {
    vi.mocked(loadSetupChecklist).mockRejectedValue(new Error("offline"));

    renderCard();

    await waitFor(() => expect(vi.mocked(loadSetupChecklist)).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("dashboard.setupChecklist.title")).toBeNull();
  });

  it("dismisses through the API and hides the widget", async () => {
    vi.mocked(loadSetupChecklist).mockResolvedValue(status());
    vi.mocked(dismissSetupChecklist).mockResolvedValue(
      status({ dismissedAt: "2026-10-15T09:00:00.000Z" }),
    );

    renderCard();

    fireEvent.click(await screen.findByText("dashboard.setupChecklist.dismiss"));

    expect(vi.mocked(dismissSetupChecklist)).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText("dashboard.setupChecklist.title")).toBeNull());
  });
});

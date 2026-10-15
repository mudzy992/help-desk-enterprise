// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallSlaReviewStep } from "@/components/install/install-sla-review-step";
import {
  loadInstallSlaReview,
  saveInstallSlaReview,
  type InstallSlaReviewStatus,
} from "@/services/install-content-api";

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/install-content-api", () => ({
  loadInstallSlaReview: vi.fn(),
  saveInstallSlaReview: vi.fn(),
}));

/*
  F4.4: one button, two meanings — and the difference matters. With no edits the
  step only records that the operator confirmed the seeded values; with an edit it
  has to send the week, otherwise „Sačuvaj izmjene“ would save nothing at all.
*/
const status: InstallSlaReviewStatus = {
  review: null,
  calendar: {
    id: "calendar-1",
    key: "BH_STANDARD",
    name: "Standardno radno vrijeme",
    timezone: "Europe/Sarajevo",
    weeklyHours: { "1": [{ start: "08:00", end: "16:00" }] },
    isActive: true,
    holidays: [{ id: "holiday-1", date: "2026-01-01", name: "Nova godina" }],
  },
  matrix: {
    cells: [
      { id: null, impact: "HIGH", urgency: "HIGH", priority: "CRITICAL" },
      { id: null, impact: "LOW", urgency: "LOW", priority: "LOW" },
    ],
  },
};

describe("InstallSlaReviewStep", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(loadInstallSlaReview).mockReset();
    vi.mocked(saveInstallSlaReview).mockReset();
  });

  it("records the confirmation without sending a week", async () => {
    vi.mocked(loadInstallSlaReview).mockResolvedValue(status);
    vi.mocked(saveInstallSlaReview).mockResolvedValue({
      ...status,
      review: "confirmed",
      calendarUpdated: false,
      matrixUpdated: false,
    });
    const onSaved = vi.fn();

    render(<InstallSlaReviewStep onSaved={onSaved} />);

    // The mock's `t` returns the key, so the calendar name only shows up through
    // the interpolation the real dictionary provides.
    expect(await screen.findByText("install.slaReview.calendar.title")).toBeTruthy();
    expect(screen.getByText("CRITICAL")).toBeTruthy();
    fireEvent.click(screen.getByText("install.slaReview.confirm"));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(saveInstallSlaReview).toHaveBeenCalledWith({ outcome: "confirmed" });
    expect(await screen.findByText("install.slaReview.review.confirmed")).toBeTruthy();
  });

  it("sends the edited week as an adjustment", async () => {
    vi.mocked(loadInstallSlaReview).mockResolvedValue(status);
    vi.mocked(saveInstallSlaReview).mockResolvedValue({
      ...status,
      review: "adjusted",
      calendarUpdated: true,
      matrixUpdated: false,
    });

    render(<InstallSlaReviewStep />);

    const fromInputs = await screen.findAllByLabelText("install.slaReview.calendar.fromLabel");
    fireEvent.change(fromInputs[0]!, { target: { value: "09:00" } });

    expect(screen.getByText("install.slaReview.submitAdjust")).toBeTruthy();
    fireEvent.click(screen.getByText("install.slaReview.submitAdjust"));

    await waitFor(() =>
      expect(saveInstallSlaReview).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "adjusted" }),
      ),
    );
    const sent = vi.mocked(saveInstallSlaReview).mock.calls[0]?.[0];
    expect(sent?.weeklyHours?.["1"]).toEqual([{ start: "09:00", end: "16:00" }]);
    // A day the calendar does not list is sent as closed, not as a default shift.
    expect(sent?.weeklyHours?.["6"]).toEqual([]);
  });

  it("refuses to save a week without a single working day", async () => {
    vi.mocked(loadInstallSlaReview).mockResolvedValue(status);

    render(<InstallSlaReviewStep />);

    const toggles = await screen.findAllByLabelText("install.slaReview.calendar.toggleDay");
    fireEvent.click(toggles[0]!);

    expect(screen.getByText("install.slaReview.errorHours")).toBeTruthy();
    expect(screen.getByText("install.slaReview.submitAdjust").closest("button")?.disabled).toBe(
      true,
    );
  });
});

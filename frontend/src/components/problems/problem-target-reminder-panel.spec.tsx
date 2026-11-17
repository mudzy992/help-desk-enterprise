// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { ProblemTargetReminderPanel } from "@/components/problems/problem-target-reminder-panel";
import { ApiError } from "@/services/api";
import { getProblemTargetReminders, retryProblemTargetReminder } from "@/services/problems-api";
import type {
  ProblemDetail,
  ProblemTargetReminder,
  ProblemTargetReminders,
} from "@/services/problems-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/problems-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/problems-api")>();
  return {
    ...actual,
    getProblemTargetReminders: vi.fn(),
    retryProblemTargetReminder: vi.fn(),
  };
});

const getReminders = vi.mocked(getProblemTargetReminders);
const retryReminder = vi.mocked(retryProblemTargetReminder);

const problem = {
  id: "p1",
  number: "P-000012",
  status: "INVESTIGATING",
  targetAt: "2027-11-30T12:00:00.000Z",
  version: 3,
  permissions: { canManage: true, canClose: true, canClaim: false, canLink: true },
} as unknown as ProblemDetail;

const dueRow: ProblemTargetReminder = {
  id: "r1",
  stage: "due",
  status: "FAILED",
  targetAt: "2027-11-30T12:00:00.000Z",
  attempts: 2,
  deliveredCount: 0,
  recipientCount: 1,
  errorCode: "IN_APP_FAILED",
  nextAttemptAt: "2027-11-30T07:25:00.000Z",
  lastAttemptAt: "2027-11-30T07:23:00.000Z",
  completedAt: null,
  canRetry: true,
};

const sentRow: ProblemTargetReminder = {
  ...dueRow,
  id: "r2",
  stage: "before",
  status: "SENT",
  attempts: 1,
  deliveredCount: 2,
  recipientCount: 2,
  errorCode: null,
  nextAttemptAt: null,
  completedAt: "2027-11-29T07:23:00.000Z",
  canRetry: false,
};

const noRecipientRow: ProblemTargetReminder = {
  ...dueRow,
  id: "r3",
  stage: "overdue",
  status: "NO_RECIPIENT",
  attempts: 1,
  deliveredCount: 0,
  recipientCount: 0,
  errorCode: null,
  nextAttemptAt: null,
  completedAt: "2027-11-30T07:23:00.000Z",
  canRetry: false,
};

function listOf(items: readonly ProblemTargetReminder[], canRetry = true): ProblemTargetReminders {
  return { items, canRetry };
}

function renderPanel(target: ProblemDetail = problem, onRetried = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ProblemTargetReminderPanel problem={target} onRetried={onRetried} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onRetried };
}

afterEach(() => {
  cleanup();
  getReminders.mockReset();
  retryReminder.mockReset();
});

describe("ProblemTargetReminderPanel", () => {
  it("shows a failed reminder with its reason and retries it on demand", async () => {
    getReminders.mockResolvedValue(listOf([dueRow, sentRow]));
    retryReminder.mockResolvedValue({
      ...problem,
      targetReminders: listOf([
        { ...dueRow, status: "SENT", errorCode: null, canRetry: false },
        sentRow,
      ]),
    });
    const { onRetried } = renderPanel();

    const retryButton = await screen.findByTestId("problem-target-reminder-retry-r1");
    const panel = screen.getByTestId("problem-target-reminder-panel");
    expect(panel.textContent).toContain("problems.targetReminders.status.FAILED");
    expect(panel.textContent).toContain("problems.targetReminders.errorCode");
    expect(panel.textContent).toContain("problems.targetReminders.recipients");
    // A delivered reminder is shown but cannot be retried.
    expect(screen.queryByTestId("problem-target-reminder-retry-r2")).toBeNull();
    expect(panel.textContent).toContain("problems.targetReminders.sentAt");

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(retryReminder).toHaveBeenCalledWith("p1", "r1");
    });
    await waitFor(() => {
      expect(onRetried).toHaveBeenCalled();
    });
  });

  it("explains that nobody was notified instead of pretending the reminder was lost", async () => {
    getReminders.mockResolvedValue(listOf([noRecipientRow]));
    renderPanel();

    const panel = await screen.findByTestId("problem-target-reminder-panel");
    expect(panel.textContent).toContain("problems.targetReminders.status.NO_RECIPIENT");
    expect(panel.textContent).toContain("problems.targetReminders.noRecipientHint");
    expect(screen.queryByTestId("problem-target-reminder-retry-r3")).toBeNull();
  });

  it("keeps the row and shows an error when the retry fails", async () => {
    getReminders.mockResolvedValue(listOf([dueRow]));
    retryReminder.mockRejectedValue(
      new ApiError(409, "PROBLEM_TARGET_REMINDER_IN_PROGRESS", "claimed"),
    );
    const { onRetried } = renderPanel();

    fireEvent.click(await screen.findByTestId("problem-target-reminder-retry-r1"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("errors.conflict");
    expect(onRetried).not.toHaveBeenCalled();
  });

  it("hides itself for a problem without a target and for rows of an older target", async () => {
    getReminders.mockResolvedValue(listOf([dueRow]));
    renderPanel({ ...problem, targetAt: null } as unknown as ProblemDetail);
    expect(getReminders).not.toHaveBeenCalled();
    expect(screen.queryByTestId("problem-target-reminder-panel")).toBeNull();

    cleanup();
    getReminders.mockResolvedValue(listOf([{ ...dueRow, targetAt: "2027-11-20T12:00:00.000Z" }]));
    renderPanel();
    await waitFor(() => {
      expect(getReminders).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("problem-target-reminder-panel")).toBeNull();
  });
});

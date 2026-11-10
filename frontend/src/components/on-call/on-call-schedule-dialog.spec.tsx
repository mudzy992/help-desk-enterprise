// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnCallScheduleDialog } from "./on-call-schedule-dialog";
import type { OnCallGroupDetail } from "@/services/on-call-api";

const { saveOnCallSchedule, toast } = vi.hoisted(() => ({
  saveOnCallSchedule: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/services/on-call-api", async (original) => ({
  ...(await original<typeof import("@/services/on-call-api")>()),
  saveOnCallSchedule,
}));

const detail: OnCallGroupDetail = {
  group: { id: "group-1", name: "Operations" },
  schedule: null,
  segments: [],
  current: null,
  overrides: [],
  swaps: [],
  candidates: [{ userId: "user-1", displayName: "Ana" }],
  defaultTimezone: "Europe/Sarajevo",
  canManage: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderDialog() {
  const onOpenChange = vi.fn();
  const onSaved = vi.fn();
  render(
    <OnCallScheduleDialog open onOpenChange={onOpenChange} detail={detail} onSaved={onSaved} />,
  );
  return { onOpenChange, onSaved };
}

function fillReason(value = "Valid reason") {
  fireEvent.change(document.querySelector("textarea")!, { target: { value } });
}

describe("OnCallScheduleDialog", () => {
  beforeEach(() => {
    saveOnCallSchedule.mockReset();
    toast.mockReset();
  });
  afterEach(cleanup);

  it("blocks an invalid IANA zone before the API call and exposes a field error", () => {
    renderDialog();
    fillReason();
    fireEvent.change(screen.getByLabelText(/onCall\.schedule\.timezone/), {
      target: { value: "Not/A_Zone" },
    });

    expect(screen.getByText("onCall.schedule.timezoneInvalid")).toBeTruthy();
    expect(screen.getByLabelText(/onCall\.schedule\.timezone/).getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(
      (screen.getByRole("button", { name: "onCall.schedule.save" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.submit(screen.getByRole("button", { name: "onCall.schedule.save" }).closest("form")!);
    expect(saveOnCallSchedule).not.toHaveBeenCalled();
  });

  it("trims values and submits the complete schedule contract", async () => {
    saveOnCallSchedule.mockResolvedValue({ id: "schedule-1" });
    const { onOpenChange, onSaved } = renderDialog();
    fillReason("  planned rotation  ");
    fireEvent.change(screen.getByLabelText(/onCall\.schedule\.timezone/), {
      target: { value: " Europe/Sarajevo " },
    });
    fireEvent.click(screen.getByRole("button", { name: "onCall.schedule.save" }));

    await waitFor(() => expect(saveOnCallSchedule).toHaveBeenCalledTimes(1));
    expect(saveOnCallSchedule).toHaveBeenCalledWith(
      "group-1",
      expect.objectContaining({ timezone: "Europe/Sarajevo", reason: "planned rotation" }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("guards a synchronous double submit and keeps the dialog open after an API failure", async () => {
    const request = deferred<{ id: string }>();
    saveOnCallSchedule.mockReturnValue(request.promise);
    const { onOpenChange, onSaved } = renderDialog();
    fillReason();
    const save = screen.getByRole("button", { name: "onCall.schedule.save" });

    fireEvent.click(save);
    fireEvent.click(save);
    expect(saveOnCallSchedule).toHaveBeenCalledTimes(1);
    expect((save as HTMLButtonElement).disabled).toBe(true);

    request.reject(new Error("offline"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect((save as HTMLButtonElement).disabled).toBe(false);
  });
});

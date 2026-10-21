// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "@/components/ui/toast";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function Harness({ action }: { readonly action?: () => void }) {
  const { toast } = useToast();
  const [result, setResult] = useState("");
  return (
    <>
      <button
        type="button"
        onClick={() => {
          const first = toast({
            title: "Saved",
            duration: 0,
            action: action ? { label: "Undo", onClick: action } : undefined,
          });
          const second = toast({ title: "Saved", duration: 0 });
          setResult(`${first}:${second}`);
        }}
      >
        duplicate
      </button>
      {["One", "Two", "Three", "Four"].map((title) => (
        <button key={title} type="button" onClick={() => toast({ title, duration: 0 })}>
          {title}
        </button>
      ))}
      <button type="button" onClick={() => toast({ title: "Timed", duration: 1000 })}>
        timed
      </button>
      <output>{result}</output>
    </>
  );
}

function setup(action?: () => void) {
  render(
    <ToastProvider>
      <Harness action={action} />
    </ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ToastProvider behavior", () => {
  it("returns the actual merged id synchronously and restarts one card", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "duplicate" }));
    const [first, second] = screen.getByText(/^\d+:\d+$/).textContent?.split(":") ?? [];
    expect(first).toBe(second);
    expect(screen.getAllByTestId("toast")).toHaveLength(1);
    expect(screen.getByText("×2")).toBeTruthy();
  });

  it("shows three cards, queues the rest, and promotes the next after dismiss", () => {
    setup();
    for (const title of ["One", "Two", "Three", "Four"])
      fireEvent.click(screen.getByRole("button", { name: title }));
    expect(screen.getAllByTestId("toast")).toHaveLength(3);
    const region = screen.getByTestId("toast-region");
    expect(within(region).queryByText("Four")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "ui.dismiss" })[0]!);
    expect(within(region).getByText("Four")).toBeTruthy();
  });

  it("pauses the timer while hovered and supports Escape dismissal", () => {
    vi.useFakeTimers();
    setup();
    fireEvent.click(screen.getByRole("button", { name: "timed" }));
    const region = screen.getByTestId("toast-region");
    act(() => vi.advanceTimersByTime(400));
    fireEvent.mouseEnter(region);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText("Timed")).toBeTruthy();
    fireEvent.mouseLeave(region);
    act(() => vi.advanceTimersByTime(601));
    expect(screen.queryByText("Timed")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "One" }));
    fireEvent.keyDown(screen.getByTestId("toast"), { key: "Escape" });
    expect(within(region).queryByText("One")).toBeNull();
  });

  it("runs an action once and dismisses its toast", () => {
    const action = vi.fn();
    setup(action);
    fireEvent.click(screen.getByRole("button", { name: "duplicate" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(action).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("toast")).toBeNull();
  });
});

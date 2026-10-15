// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";

/*
  F0.2 (IN3): each wizard step reads its own state, and the shell must be able to
  tell "still loading" from "could not be read" — the difference decides whether
  a form is rendered at all.
*/
function Probe({
  load,
  onState,
}: {
  readonly load: () => Promise<string>;
  readonly onState?: (value: string) => void;
}) {
  const resource = useInstallStepResource(load);
  const value =
    resource.status === "loading"
      ? "loading"
      : resource.status === "error"
        ? `error:${(resource.error as Error).message}`
        : `ready:${resource.data}`;
  return (
    <div>
      <p data-testid="state">{value}</p>
      <button type="button" onClick={resource.retry}>
        retry
      </button>
      <button type="button" onClick={() => resource.setData("saved")}>
        save
      </button>
      <span data-testid="hook-identity" onClick={() => onState?.("clicked")} />
    </div>
  );
}

describe("useInstallStepResource", () => {
  afterEach(cleanup);

  it("goes from loading to ready", async () => {
    render(<Probe load={async () => "loaded"} />);

    expect(screen.getByTestId("state").textContent).toBe("loading");
    expect(await screen.findByText("ready:loaded")).toBeTruthy();
  });

  it("reports a failed load as an error instead of falling back to empty data", async () => {
    render(<Probe load={async () => Promise.reject(new Error("boom"))} />);

    expect(await screen.findByText("error:boom")).toBeTruthy();
  });

  it("re-runs the loader on retry", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("loaded");
    render(<Probe load={load} />);

    expect(await screen.findByText("error:boom")).toBeTruthy();
    screen.getByRole("button", { name: "retry" }).click();

    expect(await screen.findByText("ready:loaded")).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps an inline loader stable across renders", async () => {
    const load = vi.fn(async () => "loaded");
    const { rerender } = render(<Probe load={load} />);
    await screen.findByText("ready:loaded");

    rerender(<Probe load={load} />);
    act(() => {
      screen.getByRole("button", { name: "save" }).click();
    });

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("accepts saved data without a refetch", async () => {
    const load = vi.fn(async () => "loaded");
    render(<Probe load={load} />);
    await screen.findByText("ready:loaded");

    screen.getByRole("button", { name: "save" }).click();

    expect(await screen.findByText("ready:saved")).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

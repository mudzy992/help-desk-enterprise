// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { ApiError } from "@/services/api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options === undefined ? key : `${key}:${String(options.requestId)}`,
  }),
}));

describe("InstallStepLoadError", () => {
  afterEach(cleanup);

  it("announces the failure, shows the request id and retries", () => {
    const onRetry = vi.fn();
    render(
      <InstallStepLoadError
        error={new ApiError(503, "REQUEST_FAILED", "boom", "req-42")}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("install.stepLoadError");
    expect(screen.getByText("install.requestId:req-42")).toBeTruthy();

    screen.getByRole("button", { name: "install.retry" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("omits the request id line when the server did not send one", () => {
    render(<InstallStepLoadError error={new Error("network")} onRetry={() => undefined} />);

    expect(screen.getByRole("alert").textContent).not.toContain("install.requestId");
    expect(screen.getByRole("button", { name: "install.retry" })).toBeTruthy();
  });
});

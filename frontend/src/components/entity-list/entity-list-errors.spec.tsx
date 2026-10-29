// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntityListQueryError } from "@/components/entity-list/entity-list-query-error";
import { ModuleCapabilityGate } from "@/components/entity-list/module-capability-gate";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { requestId?: string }) => values?.requestId ?? key,
  }),
}));

describe("entity list recoverable errors", () => {
  afterEach(cleanup);

  it("renders a correlated list error and retries it", () => {
    const retry = vi.fn();
    render(
      <EntityListQueryError
        messageKey="errors.server"
        requestId="list-request"
        retrying={false}
        onRetry={retry}
      />,
    );

    expect(screen.getByText("list-request")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ui.retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("disables list retry while recovery is running", () => {
    render(
      <EntityListQueryError
        messageKey="errors.server"
        requestId={null}
        retrying
        onRetry={vi.fn()}
      />,
    );

    expect((screen.getByRole("button", { name: "ui.loading" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("keeps capability errors correlated and retryable", () => {
    const retry = vi.fn();
    render(
      <ModuleCapabilityGate
        state="error"
        header={<h1>Assets</h1>}
        icon={<span />}
        disabledTitle="disabled"
        disabledBody="disabled body"
        forbiddenTitle="forbidden"
        forbiddenBody="forbidden body"
        errorKey="errors.server"
        requestId="capability-request"
        onRetry={retry}
      >
        <p>ready</p>
      </ModuleCapabilityGate>,
    );

    expect(screen.getByText("capability-request")).toBeTruthy();
    expect(screen.queryByText("ready")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ui.retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

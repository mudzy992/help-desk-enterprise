// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntityDetailQueryError } from "@/components/entity-list/entity-detail-query-error";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { requestId?: string }) => values?.requestId ?? key,
  }),
}));

describe("EntityDetailQueryError", () => {
  afterEach(cleanup);

  it("shows request correlation and invokes retry", () => {
    const retry = vi.fn();
    render(
      <EntityDetailQueryError
        messageKey="errors.server"
        requestId="detail-request"
        retrying={false}
        onRetry={retry}
      />,
    );
    expect(screen.getByText("detail-request")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ui.retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate recovery while retrying", () => {
    render(
      <EntityDetailQueryError
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
});

// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Route, RouterProvider, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteErrorElement } from "@/components/layout/route-error-boundary";
import { reportClientError } from "@/lib/app/client-logger";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/app/client-logger", () => ({ reportClientError: vi.fn() }));

function BrokenPage(): null {
  throw new Error("render failed");
}

function DeclarativeRoutes() {
  return (
    <Routes>
      <Route path="/" element={<BrokenPage />} />
    </Routes>
  );
}

describe("RouteErrorElement", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the shared retry fallback for errors in declarative routes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const router = createMemoryRouter(
      [
        {
          id: "app-root",
          path: "/*",
          element: <DeclarativeRoutes />,
          errorElement: <RouteErrorElement />,
        },
      ],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("app.pageLoad.errorTitle")).toBeTruthy();
    expect(screen.getByText("app.pageLoad.errorBody")).toBeTruthy();
    expect(screen.getByRole("button", { name: "app.pageLoad.reload" })).toBeTruthy();
    await waitFor(() => {
      expect(reportClientError).toHaveBeenCalledWith(
        "route_render_failed",
        expect.objectContaining({ message: "render failed" }),
      );
    });
  });
});

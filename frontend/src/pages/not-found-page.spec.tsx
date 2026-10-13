// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotFoundPage } from "@/pages/not-found-page";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("NotFoundPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("explains the miss and links back to the dashboard", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("app.notFound.title")).toBeTruthy();
    const link = screen.getByRole("link", { name: "app.notFound.action" });
    expect(link.getAttribute("href")).toBe("/");
  });
});

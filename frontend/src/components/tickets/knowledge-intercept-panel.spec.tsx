// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeInterceptPanel } from "@/components/tickets/knowledge-intercept-panel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

const panelProps = {
  items: [],
  helped: false,
  helpedArticleId: null,
  onHelped: () => undefined,
  onResetHelped: () => undefined,
  onContinue: () => undefined,
  isSubmitting: false,
};

describe("KnowledgeInterceptPanel without the knowledge base", () => {
  afterEach(() => {
    cleanup();
  });

  it("says why there are no suggestions and drops the required badge", () => {
    render(<KnowledgeInterceptPanel {...panelProps} isUnavailable={true} />);

    expect(screen.getByText("tickets.interceptUnavailableTitle")).toBeDefined();
    expect(screen.getByText("tickets.interceptUnavailable")).toBeDefined();
    expect(screen.queryByText("tickets.interceptRequired")).toBeNull();
    // Korisnik može nastaviti i kada nema članaka.
    expect(screen.getByText("tickets.continueSend")).toBeDefined();
  });

  it("keeps the ordinary empty state when the knowledge base answered with nothing", () => {
    render(<KnowledgeInterceptPanel {...panelProps} isUnavailable={false} />);

    expect(screen.getByText("tickets.interceptEmptyTitle")).toBeDefined();
    expect(screen.getByText("tickets.interceptRequired")).toBeDefined();
  });
});

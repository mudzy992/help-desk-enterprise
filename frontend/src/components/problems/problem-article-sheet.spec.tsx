// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { ProblemArticleSheet } from "@/components/problems/problem-article-sheet";
import { ApiError } from "@/services/api";
import { createProblemArticle, getProblemArticleDraft } from "@/services/problems-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/problems-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/problems-api")>();
  return {
    ...actual,
    getProblemArticleDraft: vi.fn(),
    createProblemArticle: vi.fn(),
  };
});

const draft = vi.mocked(getProblemArticleDraft);
const create = vi.mocked(createProblemArticle);

const articleDraft = {
  title: "Spooler se ruši",
  body: "Simptomi\nRed se zaustavlja.",
  serviceId: null,
  organizationalUnitId: "ou1",
  replacements: { email: 0, person: 0, ip: 0, phone: 0 },
};

beforeEach(() => {
  draft.mockResolvedValue(articleDraft);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSheet(onCreated = vi.fn(), onOpenChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ProblemArticleSheet
          open
          onOpenChange={onOpenChange}
          problemId="p1"
          options={
            {
              groups: [],
              organizationalUnits: [],
              services: [{ id: "s1", name: "Štampa" }],
            } as never
          }
          onCreated={onCreated}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onCreated, onOpenChange };
}

async function fillSheet() {
  fireEvent.change(await screen.findByTestId("problem-article-service"), {
    target: { value: "s1" },
  });
}

describe("ProblemArticleSheet (W7.27)", () => {
  it("creates the article and reports the accepted one", async () => {
    create.mockResolvedValueOnce({ id: "a1", title: "Spooler se ruši", status: "DRAFT" });
    const { onCreated, onOpenChange } = renderSheet();
    await fillSheet();
    fireEvent.click(screen.getByTestId("problem-article-submit"));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith("p1", {
      title: "Spooler se ruši",
      body: "Simptomi\nRed se zaustavlja.",
      serviceId: "s1",
      organizationalUnitId: "ou1",
    });
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({
        id: "a1",
        title: "Spooler se ruši",
        status: "DRAFT",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("accepts a replayed article (HTTP 200 for an already linked problem) as success", async () => {
    // The server replays the article when the same submit arrives twice.
    create.mockResolvedValueOnce({ id: "a-winner", title: "Spooler se ruši", status: "DRAFT" });
    const { onCreated } = renderSheet();
    await fillSheet();
    fireEvent.click(screen.getByTestId("problem-article-submit"));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({
        id: "a-winner",
        title: "Spooler se ruši",
        status: "DRAFT",
      }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the sheet open and repeats the failure inline and as a danger toast", async () => {
    create.mockRejectedValueOnce(new ApiError(400, "PROBLEM_ARTICLE_INVALID", "body"));
    const { onCreated, onOpenChange } = renderSheet();
    await fillSheet();
    fireEvent.click(screen.getByTestId("problem-article-submit"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("problems.errors.articleInvalid");
    const toasts = await screen.findAllByTestId("toast");
    expect(toasts.some((toast) => toast.getAttribute("data-tone") === "danger")).toBe(true);
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByTestId("problem-article-submit")).toBeTruthy();
  });
});

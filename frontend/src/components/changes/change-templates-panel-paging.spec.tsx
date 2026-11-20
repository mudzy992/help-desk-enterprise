// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangeTemplate } from "@/services/changes-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "bs" }, t: (key: string) => key }),
}));

const fetchNextPage = vi.fn();
let infinite: Record<string, unknown> = {};

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => infinite,
  useQueryClient: () => ({ fetchQuery: vi.fn(), invalidateQueries: vi.fn() }),
}));

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const { ChangeTemplatesPanel } = await import("@/components/changes/change-templates-panel");

function template(id: string, name: string): ChangeTemplate {
  return {
    id,
    name,
    description: "",
    implementationPlan: "plan",
    backoutPlan: "backout",
    testPlan: null,
    impact: "LOW",
    likelihood: "LOW",
    risk: "LOW",
    causesDowntime: false,
    isActive: true,
    services: [],
    usageCount: 0,
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
    revision: "2030-01-01T00:00:00.000Z",
  };
}

function state(pages: readonly unknown[], hasNextPage: boolean) {
  infinite = {
    data: { pages },
    isLoading: false,
    error: null,
    hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage,
  };
}

describe("ChangeTemplatesPanel paging (BA-changes-18)", () => {
  afterEach(() => {
    cleanup();
    fetchNextPage.mockClear();
  });

  it("asks for the next page instead of ending the catalogue at 500 rows", () => {
    state(
      [{ items: [template("tpl-1", "Standardni restart")], hasMore: true, nextCursor: "tpl-1" }],
      true,
    );
    render(<ChangeTemplatesPanel options={undefined} />);

    expect(screen.getByText("Standardni restart")).toBeTruthy();
    fireEvent.click(screen.getByTestId("change-templates-more"));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("shows every loaded page in one table", () => {
    state(
      [
        { items: [template("tpl-1", "Prvi")], hasMore: true, nextCursor: "tpl-1" },
        { items: [template("tpl-2", "Drugi")], hasMore: false, nextCursor: null },
      ],
      false,
    );
    render(<ChangeTemplatesPanel options={undefined} />);

    expect(screen.getByText("Prvi")).toBeTruthy();
    expect(screen.getByText("Drugi")).toBeTruthy();
    expect(screen.queryByTestId("change-templates-more")).toBeNull();
  });
});

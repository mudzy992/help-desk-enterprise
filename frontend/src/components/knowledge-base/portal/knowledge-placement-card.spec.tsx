// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgePlacementCard } from "@/components/knowledge-base/portal/knowledge-placement-card";
import type { KnowledgeArticleResponse } from "@/services/knowledge-base-api";
import { listKnowledgeCategories } from "@/services/knowledge-portal-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked }: { checked: boolean }) => (
    <input type="checkbox" checked={checked} readOnly />
  ),
}));

vi.mock("@/services/knowledge-portal-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/knowledge-portal-api")>()),
  listKnowledgeCategories: vi.fn().mockResolvedValue([]),
}));

const article = (id: string, categoryId: string | null) =>
  ({ id, categoryId, isFaq: false, faqOrder: null }) as KnowledgeArticleResponse;

afterEach(cleanup);

describe("KnowledgePlacementCard", () => {
  it("synchronizes placement when the article prop changes", async () => {
    vi.mocked(listKnowledgeCategories).mockResolvedValue([
      { id: "first", nameBs: "Prva", nameEn: "First", parentId: null },
      { id: "second", nameBs: "Druga", nameEn: "Second", parentId: null },
    ] as never);
    const { rerender } = render(
      <KnowledgePlacementCard article={article("one", "first")} onChanged={vi.fn()} />,
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("first"));
    rerender(<KnowledgePlacementCard article={article("two", "second")} onChanged={vi.fn()} />);
    expect(select.value).toBe("second");
  });
});

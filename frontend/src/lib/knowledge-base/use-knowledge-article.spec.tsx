// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useKnowledgeArticle } from "@/lib/knowledge-base/use-knowledge-article";
import { getKnowledgeArticle, type KnowledgeArticleResponse } from "@/services/knowledge-base-api";

vi.mock("@/services/knowledge-base-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/knowledge-base-api")>()),
  getKnowledgeArticle: vi.fn(),
}));

const article = (id: string) => ({ id, title: id }) as KnowledgeArticleResponse;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

afterEach(() => vi.clearAllMocks());

describe("useKnowledgeArticle", () => {
  it("does not let the previous article response overwrite the current id", async () => {
    const first = deferred<KnowledgeArticleResponse>();
    const second = deferred<KnowledgeArticleResponse>();
    vi.mocked(getKnowledgeArticle)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ id }) => useKnowledgeArticle(id), {
      initialProps: { id: "first" },
    });
    rerender({ id: "second" });
    await act(async () => second.resolve(article("second")));
    await waitFor(() => expect(result.current.article?.id).toBe("second"));
    await act(async () => first.resolve(article("first")));
    expect(result.current.article?.id).toBe("second");
  });

  it("keeps the article visible during a soft refresh", async () => {
    vi.mocked(getKnowledgeArticle).mockResolvedValueOnce(article("one"));
    const refresh = deferred<KnowledgeArticleResponse>();
    vi.mocked(getKnowledgeArticle).mockReturnValueOnce(refresh.promise);
    const { result } = renderHook(() => useKnowledgeArticle("one"));
    await waitFor(() => expect(result.current.article?.id).toBe("one"));
    act(() => void result.current.reload());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRefreshing).toBe(true);
    await act(async () => refresh.resolve(article("one")));
  });
});

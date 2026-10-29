// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { useEntityMutation } from "@/lib/entity-list/use-entity-mutation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe("useEntityMutation", () => {
  it("blocks a synchronous double submit and invalidates only declared keys", async () => {
    const request = deferred<void>();
    const mutationFn = vi.fn(() => request.promise);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useEntityMutation({
          mutationFn,
          invalidate: () => [["assets", "list"]],
          onSuccess: vi.fn(),
          onError: vi.fn(),
        }),
      { wrapper },
    );

    act(() => {
      result.current.mutate("first");
      result.current.mutate("second");
    });
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));

    request.resolve();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["assets", "list"] });
  });

  it("releases the guard after an error so retry can run", async () => {
    const mutationFn = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce();
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useEntityMutation({
          mutationFn,
          invalidate: () => [],
          onSuccess: vi.fn(),
          onError: vi.fn(),
        }),
      { wrapper },
    );

    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isError).toBe(true));
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mutationFn).toHaveBeenCalledTimes(2);
  });
});

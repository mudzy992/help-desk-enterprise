// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/api";
import { useCatalogRoutingCoverage } from "./use-catalog-routing-coverage";

const loader = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/services/load-catalog-routing-coverage", () => ({
  loadCatalogRoutingCoverage: loader.load,
}));

function wrapper({ children }: { readonly children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("useCatalogRoutingCoverage", () => {
  beforeEach(() => loader.load.mockReset());

  it("retains the last routing index and exposes correlation after refresh failure", async () => {
    loader.load.mockResolvedValueOnce([]);
    const { result } = renderHook(useCatalogRoutingCoverage, { wrapper });
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    loader.load.mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "offline", "req-routing"));
    await act(async () => result.current.reload());
    await waitFor(() => expect(result.current.requestId).toBe("req-routing"));
    expect(result.current.hasLoaded).toBe(true);
    expect(result.current.isAvailable).toBe(true);
  });
});

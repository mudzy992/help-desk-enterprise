// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadVisibleOnboardings } from "@/lib/services/load-visible-onboardings";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import { useVisibleOnboardings } from "@/lib/services/use-visible-onboardings";

vi.mock("@/lib/services/load-visible-onboardings", () => ({
  loadVisibleOnboardings: vi.fn(async () => []),
}));

function wrapper({ children }: { readonly children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

const draftRow = {
  service: { id: "draft-1", lifecycle: "DRAFT" },
} as unknown as ServiceCatalogRow;

describe("useVisibleOnboardings", () => {
  beforeEach(() => {
    vi.mocked(loadVisibleOnboardings).mockClear();
  });

  afterEach(cleanup);

  it("does not reload when rerenders receive equivalent catalog rows", async () => {
    const { rerender } = renderHook(
      ({ rows }: { rows: readonly ServiceCatalogRow[] }) => useVisibleOnboardings(rows),
      { initialProps: { rows: [draftRow] }, wrapper },
    );

    await waitFor(() => expect(loadVisibleOnboardings).toHaveBeenCalledTimes(1));
    rerender({ rows: [draftRow] });
    rerender({ rows: [draftRow] });

    expect(loadVisibleOnboardings).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSlaPageMutations } from "@/lib/sla/use-sla-page-mutations";
import { createSlaProfile } from "@/services/sla-api";

vi.mock("@/services/sla-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/sla-api")>()),
  createSlaProfile: vi.fn(),
}));

describe("useSlaPageMutations", () => {
  it("selects a newly created profile before targeted reload", async () => {
    vi.mocked(createSlaProfile).mockResolvedValue({ id: "created" } as never);
    const order: string[] = [];
    const data = {
      selected: undefined,
      setErrorKey: vi.fn(),
      setSelectedId: (id: string) => order.push(`select:${id}`),
      load: async () => {
        order.push("load");
      },
    };
    const { result } = renderHook(() => useSlaPageMutations(data as never, true));
    await act(async () => {
      await result.current.saveProfile({ key: "new", name: "New" } as never);
    });
    expect(order).toEqual(["select:created", "load"]);
  });
});

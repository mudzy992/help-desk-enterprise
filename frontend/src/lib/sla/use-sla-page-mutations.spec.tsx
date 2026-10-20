// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSlaPageMutations } from "@/lib/sla/use-sla-page-mutations";
import { ApiError } from "@/services/api";
import {
  createSlaProfile,
  createSlaRule,
  deleteSlaProfile,
  deleteSlaRule,
  updateSlaProfile,
  updateSlaRule,
} from "@/services/sla-api";

vi.mock("@/services/sla-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/sla-api")>()),
  createSlaProfile: vi.fn(),
  updateSlaProfile: vi.fn(),
  deleteSlaProfile: vi.fn(),
  createSlaRule: vi.fn(),
  updateSlaRule: vi.fn(),
  deleteSlaRule: vi.fn(),
}));

const baseData = (selected?: { id: string }) => ({
  selected,
  setMutationError: vi.fn(),
  setErrorKey: vi.fn(),
  setSelectedId: vi.fn(),
  clearSelection: vi.fn(),
  load: vi.fn().mockResolvedValue(undefined),
  reloadSelected: vi.fn().mockResolvedValue(undefined),
});

beforeEach(() => vi.clearAllMocks());

describe("useSlaPageMutations", () => {
  it("blocks synchronous duplicate profile create and selects before the base refresh", async () => {
    let release!: (value: { id: string }) => void;
    vi.mocked(createSlaProfile).mockReturnValue(
      new Promise((resolve) => (release = resolve)) as never,
    );
    const data = baseData();
    const { result } = renderHook(() => useSlaPageMutations(data as never, true));
    let first!: Promise<void>;
    act(() => {
      first = result.current.saveProfile({ key: "new", name: "New" } as never);
      void result.current.saveProfile({ key: "new", name: "New" } as never);
    });
    expect(createSlaProfile).toHaveBeenCalledTimes(1);
    release({ id: "created" });
    await act(() => first);
    expect(data.setSelectedId).toHaveBeenCalledWith("created");
    expect(data.load).toHaveBeenCalledTimes(1);
  });

  it("updates and deletes a profile with only the base snapshot refresh", async () => {
    vi.mocked(updateSlaProfile).mockResolvedValue({} as never);
    vi.mocked(deleteSlaProfile).mockResolvedValue(undefined as never);
    const data = baseData({ id: "p1" });
    const { result } = renderHook(() => useSlaPageMutations(data as never, true));
    await act(() => result.current.saveProfile({ key: "p", name: "P" } as never));
    await act(() => result.current.removeProfile("reason"));
    expect(updateSlaProfile).toHaveBeenCalledTimes(1);
    expect(deleteSlaProfile).toHaveBeenCalledTimes(1);
    expect(data.load).toHaveBeenCalledTimes(2);
    expect(data.reloadSelected).not.toHaveBeenCalled();
  });

  it("creates, updates and deletes rules with only detail refreshes", async () => {
    vi.mocked(createSlaRule).mockResolvedValue({} as never);
    vi.mocked(updateSlaRule).mockResolvedValue({} as never);
    vi.mocked(deleteSlaRule).mockResolvedValue(undefined as never);
    const data = baseData({ id: "p1" });
    const { result } = renderHook(() => useSlaPageMutations(data as never, true));
    await act(() => result.current.saveRule({} as never));
    await act(() => result.current.saveRule({} as never, { id: "r1" } as never));
    await act(() => result.current.removeRule({ id: "r1" } as never, "reason"));
    expect(data.reloadSelected).toHaveBeenCalledTimes(3);
    expect(data.load).not.toHaveBeenCalled();
  });

  it("correlates an error and allows an explicit retry", async () => {
    vi.mocked(updateSlaProfile)
      .mockRejectedValueOnce(new ApiError(503, "FAILED", "failed", "req-mutation"))
      .mockResolvedValueOnce({} as never);
    const data = baseData({ id: "p1" });
    const { result } = renderHook(() => useSlaPageMutations(data as never, true));
    await act(() => result.current.saveProfile({ key: "p", name: "P" } as never));
    expect(data.setMutationError).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: "req-mutation" }),
    );
    await act(() => result.current.saveProfile({ key: "p", name: "P" } as never));
    expect(updateSlaProfile).toHaveBeenCalledTimes(2);
    expect(data.load).toHaveBeenCalledTimes(1);
  });
});

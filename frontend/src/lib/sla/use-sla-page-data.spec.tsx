// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSlaPageData } from "@/lib/sla/use-sla-page-data";
import { fetchSlaSummary } from "@/services/report-summary-api";
import { ApiError } from "@/services/api";
import {
  fetchSlaCompliance,
  listSlaCalendars,
  listSlaProfileChanges,
  listSlaProfiles,
  listSlaRules,
  type SlaComplianceResponse,
  type SlaProfile,
  type SlaRule,
} from "@/services/sla-api";

vi.mock("@/services/sla-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/sla-api")>()),
  listSlaProfiles: vi.fn(),
  listSlaCalendars: vi.fn(),
  listSlaRules: vi.fn(),
  listSlaProfileChanges: vi.fn(),
  fetchSlaCompliance: vi.fn(),
}));
vi.mock("@/services/report-summary-api", () => ({ fetchSlaSummary: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const profiles = [{ id: "one" }, { id: "two" }] as unknown as readonly SlaProfile[];
const rulesOne = [{ id: "rule-one" }] as unknown as readonly SlaRule[];
const rulesTwo = [{ id: "rule-two" }] as unknown as readonly SlaRule[];
const wrapper = ({ children }: { readonly children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listSlaProfiles).mockResolvedValue(profiles);
  vi.mocked(listSlaCalendars).mockResolvedValue([]);
  vi.mocked(listSlaRules).mockResolvedValue(rulesOne);
  vi.mocked(listSlaProfileChanges).mockResolvedValue([]);
  vi.mocked(fetchSlaSummary).mockResolvedValue(null as never);
  vi.mocked(fetchSlaCompliance).mockResolvedValue({
    profiles: [],
  } as unknown as SlaComplianceResponse);
});

describe("useSlaPageData", () => {
  it("correlates and retries a base load error", async () => {
    vi.mocked(listSlaProfiles)
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "failed", "req-base"))
      .mockResolvedValueOnce(profiles);
    const { result } = renderHook(() => useSlaPageData(null), { wrapper });
    await waitFor(() => expect(result.current.baseError?.requestId).toBe("req-base"));

    await act(async () => result.current.load());
    await waitFor(() => expect(result.current.baseError).toBeNull());
    expect(listSlaProfiles).toHaveBeenCalledTimes(2);
  });

  it("loads only profile detail when selection changes and hides the previous identity", async () => {
    const second = deferred<readonly SlaRule[]>();
    vi.mocked(listSlaRules)
      .mockResolvedValueOnce(rulesOne)
      .mockImplementationOnce(() => second.promise);
    const { result } = renderHook(() => useSlaPageData(null), { wrapper });
    await waitFor(() => expect(result.current.detailReady).toBe(true));
    expect(result.current.detailProfileId).toBe("one");

    act(() => result.current.setSelectedId("two"));
    await waitFor(() => expect(result.current.isDetailLoading).toBe(true));
    expect(result.current.detailReady).toBe(false);
    expect(result.current.detailProfileId).toBe("one");
    expect(listSlaProfiles).toHaveBeenCalledTimes(1);

    second.resolve(rulesTwo);
    await waitFor(() => expect(result.current.detailReady).toBe(true));
    expect(result.current.detailProfileId).toBe("two");
    expect(result.current.rules).toBe(rulesTwo);
  });

  it("keeps a failed profile identity blocked and exposes request correlation for retry", async () => {
    vi.mocked(listSlaRules)
      .mockResolvedValueOnce(rulesOne)
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "failed", "req-detail"))
      .mockResolvedValueOnce(rulesTwo);
    const { result } = renderHook(() => useSlaPageData(null), { wrapper });
    await waitFor(() => expect(result.current.detailReady).toBe(true));

    act(() => result.current.setSelectedId("two"));
    await waitFor(() => expect(result.current.detailError?.requestId).toBe("req-detail"));
    expect(result.current.detailReady).toBe(false);

    await act(async () => result.current.reloadSelected());
    await waitFor(() => expect(result.current.detailReady).toBe(true));
    expect(result.current.detailError).toBeNull();
    expect(result.current.detailProfileId).toBe("two");
  });

  it("commits only the latest profile response", async () => {
    const first = deferred<readonly SlaRule[]>();
    const second = deferred<readonly SlaRule[]>();
    vi.mocked(listSlaRules)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { result } = renderHook(() => useSlaPageData(null), { wrapper });
    await waitFor(() => expect(listSlaRules).toHaveBeenCalledWith("one"));
    act(() => result.current.setSelectedId("two"));
    await waitFor(() => expect(listSlaRules).toHaveBeenCalledWith("two"));

    second.resolve(rulesTwo);
    await waitFor(() => expect(result.current.detailProfileId).toBe("two"));
    first.resolve(rulesOne);
    await act(async () => Promise.resolve());
    expect(result.current.detailProfileId).toBe("two");
    expect(result.current.rules).toBe(rulesTwo);
  });

  it("correlates and retries a compliance scope error", async () => {
    vi.mocked(fetchSlaCompliance)
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "failed", "req-compliance"))
      .mockResolvedValueOnce({ profiles: [] } as unknown as SlaComplianceResponse);
    const { result } = renderHook(() => useSlaPageData("ou-1", true), { wrapper });
    await waitFor(() => expect(result.current.complianceError?.requestId).toBe("req-compliance"));

    await act(async () => result.current.reloadCompliance());
    await waitFor(() => expect(result.current.complianceError).toBeNull());
    expect(fetchSlaCompliance).toHaveBeenCalledTimes(2);
  });
});

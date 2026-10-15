// @vitest-environment jsdom
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSlaPageData } from "@/lib/sla/use-sla-page-data";
import {
  listSlaCalendars,
  listSlaProfileChanges,
  listSlaProfiles,
  listSlaRules,
  type SlaProfile,
} from "@/services/sla-api";
import { fetchSlaSummary } from "@/services/report-summary-api";

vi.mock("@/services/sla-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/sla-api")>()),
  listSlaProfiles: vi.fn(),
  listSlaCalendars: vi.fn(),
  listSlaRules: vi.fn(),
  listSlaProfileChanges: vi.fn(),
  fetchSlaCompliance: vi.fn(),
}));
vi.mock("@/services/report-summary-api", () => ({ fetchSlaSummary: vi.fn() }));

const profiles = [{ id: "one" }, { id: "two" }] as unknown as readonly SlaProfile[];
const wrapper = ({ children }: { readonly children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.mocked(listSlaProfiles).mockResolvedValue(profiles);
  vi.mocked(listSlaCalendars).mockResolvedValue([]);
  vi.mocked(listSlaRules).mockResolvedValue([]);
  vi.mocked(listSlaProfileChanges).mockResolvedValue([]);
  vi.mocked(fetchSlaSummary).mockResolvedValue(null as never);
});

describe("useSlaPageData", () => {
  it("loads only profile detail when selection changes", async () => {
    const { result } = renderHook(() => useSlaPageData(null), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(listSlaProfiles).toHaveBeenCalledTimes(1);
    act(() => result.current.setSelectedId("two"));
    await waitFor(() => expect(listSlaRules).toHaveBeenCalledWith("two"));
    expect(listSlaProfiles).toHaveBeenCalledTimes(1);
  });
});

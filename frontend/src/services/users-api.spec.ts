import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequestWithHeaders } from "@/services/api";
import { listUsersSummaryPage } from "@/services/users-api";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiRequest: vi.fn(),
    apiRequestWithHeaders: vi.fn(),
  };
});

const requestWithHeaders = vi.mocked(apiRequestWithHeaders);

const user = {
  id: "user-1",
  email: "user@example.test",
  displayName: "User One",
  isActive: true,
  isLocalOnly: true,
  roleKey: "USER",
  roleName: "User",
  roleTone: "user" as const,
  organizationalUnitId: null,
  organizationalUnitName: null,
  groupName: null,
  policyPackKey: null,
  openTicketCount: 0,
  mfa: null,
  anonymizedAt: null,
  legalHold: false,
};

describe("listUsersSummaryPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the total from X-Total-Count while preserving the array response", async () => {
    requestWithHeaders.mockResolvedValue({
      data: [user],
      headers: new Headers({ "X-Total-Count": "1204" }),
    });

    await expect(
      listUsersSummaryPage({ take: 100, skip: 300, query: " user " }),
    ).resolves.toEqual({ items: [user], total: 1204 });
    expect(requestWithHeaders).toHaveBeenCalledWith("/users?take=100&skip=300&q=user");
  });

  it("fails visibly rather than treating an incomplete page as the full directory", async () => {
    requestWithHeaders.mockResolvedValue({ data: [user], headers: new Headers() });

    await expect(listUsersSummaryPage({ take: 100, skip: 0 })).rejects.toMatchObject({
      status: 502,
      code: "USER_TOTAL_COUNT_MISSING",
    });
  });

  it("rejects totals that cannot describe the returned page", async () => {
    requestWithHeaders.mockResolvedValue({
      data: [user],
      headers: new Headers({ "X-Total-Count": "0" }),
    });

    await expect(listUsersSummaryPage({ take: 100, skip: 0 })).rejects.toMatchObject({
      code: "USER_TOTAL_COUNT_MISSING",
    });
  });
});

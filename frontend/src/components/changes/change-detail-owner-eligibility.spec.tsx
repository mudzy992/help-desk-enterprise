// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangeOverview } from "@/components/changes/change-detail-sections";
import type { ChangeDetail } from "@/services/changes-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "bs" },
    t: (key: string) => key,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/lib/changes/use-change-labels", () => ({
  useChangeLevelLabels: () => ({ LOW: "low", MEDIUM: "medium", HIGH: "high" }),
  useChangeStatusLabels: () => ({ AUTHORIZATION: "authorization" }),
  useChangeTypeLabels: () => ({ NORMAL: "normal" }),
}));

function change(overrides: Partial<ChangeDetail> = {}) {
  return {
    id: "change-1",
    number: "CHG-7",
    title: "Firewall upgrade",
    type: "NORMAL",
    status: "AUTHORIZATION",
    risk: "MEDIUM",
    impact: "LOW",
    likelihood: "LOW",
    description: "Replace the appliance",
    reason: null,
    plannedStart: null,
    plannedEnd: null,
    actualStart: null,
    actualEnd: null,
    causesDowntime: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    submittedAt: null,
    authorizedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancelReason: null,
    conflictsAcknowledgedAt: null,
    approvalRound: 1,
    allowedActions: [],
    permissions: { canManage: true, canEdit: true, editScope: "full", canClaim: false },
    owner: { id: "owner-1", displayName: "Owner One", email: "owner@example.test" },
    requester: { id: "r-1", displayName: "Requester", email: "r@example.test" },
    cabGroup: null,
    organizationalUnit: { id: "ou-1", name: "Network", ouPath: "/helpdesk/network" },
    services: [],
    assets: [],
    problem: null,
    template: null,
    version: 1,
    redactedFields: [],
    detailLevel: "full",
    ownerEligible: true,
    ...overrides,
  } as unknown as ChangeDetail;
}

describe("change owner eligibility in the detail (W7.66)", () => {
  afterEach(cleanup);

  it("warns when the stored owner lost the assignment", () => {
    render(<ChangeOverview change={change({ ownerEligible: false })} />);
    expect(screen.getByText("changes.detail.ownerNotEligible")).toBeTruthy();
    expect(screen.getByText("Owner One")).toBeTruthy();
  });

  it("keeps a still-eligible owner clean", () => {
    render(<ChangeOverview change={change({ ownerEligible: true })} />);
    expect(screen.queryByText("changes.detail.ownerNotEligible")).toBeNull();
  });

  it("says nothing when the change has no owner yet", () => {
    render(<ChangeOverview change={change({ owner: null, ownerEligible: null })} />);
    expect(screen.queryByText("changes.detail.ownerNotEligible")).toBeNull();
    expect(screen.getByText("changes.list.noOwner")).toBeTruthy();
  });
});

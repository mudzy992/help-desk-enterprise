// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, expect, it } from "vitest";
import { WorkflowParametersCard } from "./workflow-parameters-card";
import type { TicketWorkflowResponse } from "@/services/workflow-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}:${JSON.stringify(values)}`,
  }),
}));

const parameters: TicketWorkflowResponse["parameters"] = {
  closeCodes: { enabled: true, requireOnResolve: true },
  requiredFields: { enabled: true, globalCount: 2 },
  reopen: { enabled: true, windowDays: 7 },
  waitingForUser: { enabled: true, reminderAfterDays: 3, autoCloseAfterDays: 10 },
  approvals: { enabled: true },
  archive: { enabled: true, afterClosedDays: 90 },
  playbooks: { enabled: true, requiredStepsOnResolve: "block" },
  unrouted: {
    enabled: true,
    ownerRole: "ADMIN",
    cleanupSlaHours: 8,
    weeklyDigest: true,
    targetGroup: null,
    targetGroupMissing: false,
  },
};

describe("WorkflowParametersCard", () => {
  it("uses sentence-level keys and localizes known owner roles", () => {
    render(
      <MemoryRouter>
        <WorkflowParametersCard parameters={parameters} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/workflow.params.closeCodesValue/)).toBeTruthy();
    expect(screen.getByText("shell.roles.admin")).toBeTruthy();
    expect(screen.getByText(/workflow.params.cleanupValue/)).toBeTruthy();
  });
});

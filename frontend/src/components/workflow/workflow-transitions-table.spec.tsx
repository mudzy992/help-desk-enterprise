// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi, describe, expect, it } from "vitest";
import { WorkflowTransitionsTable } from "./workflow-transitions-table";
import type { TicketWorkflowResponse, WorkflowTransition } from "@/services/workflow-api";

vi.mock("@/components/ui/scroll-region", () => ({
  ScrollRegion: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const transition: WorkflowTransition = {
  from: "IN_PROGRESS",
  to: "RESOLVED",
  actors: ["STAFF"],
  triggers: ["status_change"],
  guards: ["playbook_steps"],
};
const parameters: TicketWorkflowResponse["parameters"] = {
  closeCodes: null,
  requiredFields: null,
  reopen: null,
  waitingForUser: null,
  approvals: null,
  archive: null,
  playbooks: { enabled: true, requiredStepsOnResolve: "warn" },
  unrouted: {
    enabled: true,
    ownerRole: "ADMIN",
    cleanupSlaHours: 8,
    weeklyDigest: true,
    targetGroup: null,
    targetGroupMissing: false,
  },
};

describe("WorkflowTransitionsTable", () => {
  it("exposes table semantics and distinguishes the warn guard", () => {
    render(
      <WorkflowTransitionsTable
        transitions={[transition]}
        statuses={["IN_PROGRESS", "RESOLVED"]}
        selected={null}
        onSelect={vi.fn()}
        parameters={parameters}
      />,
    );
    expect(screen.getByText("workflow.tableCaption").tagName).toBe("CAPTION");
    expect(screen.getAllByRole("columnheader")).toHaveLength(5);
    expect(screen.getByText(/workflow.guardWarn/)).toBeTruthy();
  });

  it("renders a localized empty state", () => {
    render(
      <WorkflowTransitionsTable
        transitions={[]}
        statuses={["ARCHIVED"]}
        selected="ARCHIVED"
        onSelect={vi.fn()}
        parameters={parameters}
      />,
    );
    expect(screen.getByText("workflow.emptyTransitions")).toBeTruthy();
  });
});

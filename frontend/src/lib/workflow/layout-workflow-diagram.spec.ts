import { describe, expect, it } from "vitest";
import {
  boxExit,
  layoutWorkflowEdges,
  layoutWorkflowNodes,
  primaryActor,
  isNodeRelatedToSelection,
} from "./layout-workflow-diagram";

describe("layout-workflow-diagram (W3)", () => {
  const nodes = layoutWorkflowNodes([
    { status: "PENDING", phase: "intake" },
    { status: "ASSIGNED", phase: "work" },
    { status: "CLOSED", phase: "done" },
  ]);

  it("places phases in columns", () => {
    expect(nodes.map((node) => node.x)).toEqual([140, 450, 760]);
  });

  it("separates A→B from B→A", () => {
    const edges = layoutWorkflowEdges(nodes, [
      { from: "PENDING", to: "ASSIGNED", actors: ["STAFF"], triggers: ["claim"], guards: [] },
      { from: "ASSIGNED", to: "PENDING", actors: ["STAFF"], triggers: ["forward"], guards: [] },
    ]);
    expect(edges).toHaveLength(2);
    expect(edges[0].path).not.toEqual(edges[1].path);
  });

  it("uses one relation rule for selected nodes", () => {
    const transitions = [
      {
        from: "PENDING",
        to: "ASSIGNED",
        actors: ["STAFF"] as const,
        triggers: ["claim"] as const,
        guards: [],
      },
    ];
    expect(isNodeRelatedToSelection("ASSIGNED", "PENDING", transitions)).toBe(true);
    expect(isNodeRelatedToSelection("CLOSED", "PENDING", transitions)).toBe(false);
    expect(isNodeRelatedToSelection("CLOSED", null, transitions)).toBe(true);
  });

  it("exits on the node border and picks the human actor", () => {
    const point = boxExit({ x: 0, y: 0 }, { x: 1000, y: 0 }, 0);
    expect(point.x).toBe(88);
    expect(primaryActor(["SYSTEM", "REQUESTER"])).toBe("REQUESTER");
    expect(primaryActor(["SYSTEM"])).toBe("SYSTEM");
  });
});

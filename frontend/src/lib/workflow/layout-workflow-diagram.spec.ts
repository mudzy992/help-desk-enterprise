import { describe, expect, it } from "vitest";
import { boxExit, layoutWorkflowEdges, layoutWorkflowNodes, primaryActor } from "./layout-workflow-diagram";

describe("layout-workflow-diagram (paket 1.7 W3)", () => {
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

  it("exits on the node border and picks the human actor", () => {
    const point = boxExit({ x: 0, y: 0 }, { x: 1000, y: 0 }, 0);
    expect(point.x).toBe(88);
    expect(primaryActor(["SYSTEM", "REQUESTER"])).toBe("REQUESTER");
    expect(primaryActor(["SYSTEM"])).toBe("SYSTEM");
  });
});

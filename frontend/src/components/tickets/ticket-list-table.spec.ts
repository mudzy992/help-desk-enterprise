import { describe, expect, it } from "vitest";
import { directoryAssigneeNames } from "@/components/tickets/ticket-list-table";

describe("directoryAssigneeNames", () => {
  it("keeps only non-empty directory display names", () => {
    const names = directoryAssigneeNames([
      { id: "u1", displayName: "Amar Softić" },
      { id: "u2", displayName: "   " },
      { id: "u3", displayName: "" },
    ]);
    expect(names.get("u1")).toBe("Amar Softić");
    expect(names.has("u2")).toBe(false);
    expect(names.has("u3")).toBe(false);
  });
});

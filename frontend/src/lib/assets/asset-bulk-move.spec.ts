import { describe, expect, it } from "vitest";
import { planBulkMove, type BulkMoveItem } from "./asset-bulk-move";

const amra = { id: "u1", displayName: "Amra", email: "amra@example.com" };
const edin = { id: "u2", displayName: "Edin", email: "edin@example.com" };
const item = (id: string, status: BulkMoveItem["status"], assignedUser: BulkMoveItem["assignedUser"] = null): BulkMoveItem => ({ id, status, assignedUser });

describe("planBulkMove (3.2 C9b)", () => {
  it("nothing selected", () => {
    expect(planBulkMove([])).toEqual({ kind: "none" });
  });
  it("stock equipment can be assigned together", () => {
    expect(planBulkMove([item("a", "IN_STOCK"), item("b", "ORDERED")])).toEqual({ kind: "warehouse", ids: ["a", "b"] });
  });
  it("equipment of one holder can be reassigned or returned together", () => {
    expect(planBulkMove([item("a", "IN_USE", amra), item("b", "IN_REPAIR", amra)])).toMatchObject({ kind: "holder", ids: ["a", "b"], holder: amra });
  });
  it("different holders, or stock mixed with assigned, is refused", () => {
    expect(planBulkMove([item("a", "IN_USE", amra), item("b", "IN_USE", edin)])).toEqual({ kind: "mixed" });
    expect(planBulkMove([item("a", "IN_STOCK"), item("b", "IN_USE", amra)])).toEqual({ kind: "mixed" });
    expect(planBulkMove([item("a", "RETIRED")])).toEqual({ kind: "mixed" });
  });
  it("more than 50 items is refused", () => {
    expect(planBulkMove(Array.from({ length: 51 }, (_, index) => item(String(index), "IN_STOCK")))).toEqual({ kind: "too_many" });
  });
});

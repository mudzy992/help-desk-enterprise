import { describe, expect, it } from "vitest";
import { transferProblem, transferStatusTone } from "./asset-transfer-view";

describe("asset transfer view", () => {
  it("maps preview problems with an asset tag", () => {
    expect(transferProblem("not_in_stock:INV-1")).toEqual({ key: "assets.transfers.problems.not_in_stock", assetTag: "INV-1" });
    expect(transferProblem("same_user")).toEqual({ key: "assets.transfers.problems.same_user", assetTag: "" });
    expect(transferProblem("unknown")).toBeNull();
  });

  it("tones by status", () => {
    expect(transferStatusTone("SIGNED")).toBe("success");
    expect(transferStatusTone("ISSUED")).toBe("info");
    expect(transferStatusTone("CANCELLED")).toBe("neutral");
  });
});

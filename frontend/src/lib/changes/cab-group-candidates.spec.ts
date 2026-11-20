import { describe, expect, it } from "vitest";
import { ancestorPaths, cabGroupChoiceForUnit } from "@/lib/changes/cab-group-candidates";
import type { ChangeCabGroupOption } from "@/services/changes-api";

function group(id: string, path: string): ChangeCabGroupOption {
  return {
    id,
    name: id.toUpperCase(),
    organizationalUnitId: `ou-${id}`,
    organizationalUnitPath: path,
  };
}

describe("CAB group candidates (BA-changes-16)", () => {
  it("lists the unit and its ancestors, nearest first", () => {
    expect(ancestorPaths("/Skupina/Regija/Site")).toEqual([
      "/Skupina/Regija/Site",
      "/Skupina/Regija",
      "/Skupina",
    ]);
  });

  it("preselects the only group of the unit", () => {
    const choice = cabGroupChoiceForUnit(
      [group("cab-site", "/Skupina/Regija/Site"), group("cab-root", "/Skupina")],
      "/Skupina/Regija/Site",
    );
    expect(choice).toEqual({
      candidates: [group("cab-site", "/Skupina/Regija/Site")],
      autoSelectId: "cab-site",
      selectionRequired: false,
    });
  });

  it("preselects the nearest ancestor's only group, not the alphabetically first", () => {
    const choice = cabGroupChoiceForUnit(
      [group("a-root", "/Skupina"), group("z-branch", "/Skupina/Regija")],
      "/Skupina/Regija/Site",
    );
    expect(choice.autoSelectId).toBe("z-branch");
    expect(choice.selectionRequired).toBe(false);
  });

  it("requires a choice when the nearest level owns several groups", () => {
    const choice = cabGroupChoiceForUnit(
      [
        group("cab-standard", "/Skupina/Regija/Site"),
        group("cab-security", "/Skupina/Regija/Site"),
      ],
      "/Skupina/Regija/Site",
    );
    expect(choice.autoSelectId).toBeNull();
    expect(choice.selectionRequired).toBe(true);
    expect(choice.candidates.map((candidate) => candidate.id)).toEqual([
      "cab-standard",
      "cab-security",
    ]);
  });

  it("requires a choice when the chain is empty and the installation has several groups", () => {
    const choice = cabGroupChoiceForUnit(
      [group("cab-a", "/Other"), group("cab-b", "/Other")],
      "/Skupina/Regija/Site",
    );
    expect(choice.autoSelectId).toBeNull();
    expect(choice.selectionRequired).toBe(true);
  });

  it("preselects the only group of the installation", () => {
    const choice = cabGroupChoiceForUnit([group("cab-only", "/Other")], "/Skupina/Regija/Site");
    expect(choice.autoSelectId).toBe("cab-only");
    expect(choice.selectionRequired).toBe(false);
  });

  it("reports nothing to choose when the installation has no CAB group", () => {
    expect(cabGroupChoiceForUnit([], "/Skupina")).toEqual({
      candidates: [],
      autoSelectId: null,
      selectionRequired: false,
    });
  });
});

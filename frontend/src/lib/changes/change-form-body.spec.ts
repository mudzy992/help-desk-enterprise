import { describe, expect, it } from "vitest";
import {
  changeFormBody,
  changeFormUnits,
  changeWindowState,
  type ChangeFormBodyInput,
} from "@/lib/changes/change-form-body";
import type { ChangeDetail, ChangeOptions } from "@/services/changes-api";

const input: ChangeFormBodyInput = {
  title: "  Zamjena preklopnika  ",
  description: " Plan ",
  reason: " Razlog ",
  organizationalUnitId: "ou-site",
  serviceIds: ["service-1"],
  causesDowntime: true,
  plannedStart: "2030-05-01T10:00:00.000Z",
  plannedEnd: "2030-05-01T12:00:00.000Z",
  standard: false,
  impact: "MEDIUM",
  likelihood: "LOW",
  cabGroupId: "cab-site",
  implementationPlan: " ",
  backoutPlan: "Nazad",
  testPlan: "",
  communicationPlan: " ",
};

describe("change form body (BA-changes-16)", () => {
  it("sends the CAB group of a non-standard change and trims the text", () => {
    expect(changeFormBody(input)).toEqual({
      title: "Zamjena preklopnika",
      description: "Plan",
      reason: "Razlog",
      organizationalUnitId: "ou-site",
      serviceIds: ["service-1"],
      causesDowntime: true,
      plannedStart: "2030-05-01T10:00:00.000Z",
      plannedEnd: "2030-05-01T12:00:00.000Z",
      impact: "MEDIUM",
      likelihood: "LOW",
      cabGroupId: "cab-site",
      implementationPlan: null,
      backoutPlan: "Nazad",
      testPlan: null,
      communicationPlan: null,
    });
  });

  it("keeps a standard change free of approval-body fields", () => {
    const body = changeFormBody({ ...input, standard: true });
    expect(body).not.toHaveProperty("cabGroupId");
    expect(body).not.toHaveProperty("impact");
  });

  it("only carries the optional links the module can actually use", () => {
    expect(changeFormBody(input)).not.toHaveProperty("assetIds");
    expect(changeFormBody(input)).not.toHaveProperty("problemId");
    expect(
      changeFormBody({
        ...input,
        assetIds: ["asset-1"],
        problemId: "problem-1",
        ownerUserId: null,
      }),
    ).toMatchObject({ assetIds: ["asset-1"], problemId: "problem-1", ownerUserId: null });
  });
});

describe("change form units and window", () => {
  const options = {
    units: [{ id: "ou-site", name: "Site", path: "/Skupina/Site" }],
  } as unknown as ChangeOptions;

  it("keeps the change's own unit in the picker", () => {
    const change = {
      organizationalUnit: { id: "ou-gone", name: "Arhiva", ouPath: "/Skupina/Arhiva" },
    } as unknown as ChangeDetail;
    expect(changeFormUnits(options, change)).toEqual([
      { id: "ou-gone", name: "Arhiva", path: "/Skupina/Arhiva" },
      { id: "ou-site", name: "Site", path: "/Skupina/Site" },
    ]);
    expect(changeFormUnits(options)).toBe(options.units);
  });

  it("flags a half-filled and a reversed window", () => {
    expect(changeWindowState("2030-05-01T10:00", "", "2030-05-01T10:00:00.000Z", null)).toEqual({
      invalid: false,
      half: true,
    });
    expect(
      changeWindowState(
        "2030-05-01T12:00",
        "2030-05-01T10:00",
        "2030-05-01T12:00:00.000Z",
        "2030-05-01T10:00:00.000Z",
      ),
    ).toEqual({ invalid: true, half: false });
    expect(changeWindowState("nonsense", "", null, null).invalid).toBe(true);
  });
});

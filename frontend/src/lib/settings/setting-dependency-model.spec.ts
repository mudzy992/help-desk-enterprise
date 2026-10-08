import { describe, expect, it } from "vitest";
import {
  describeUnmetRequirements,
  findBlockingParents,
  isConditionMet,
  isSettingActive,
  listDirectDependents,
  readEffectiveValue,
} from "@/lib/settings/setting-dependency-model";
import type { SettingRegistryEntry } from "@/services/settings-api";

function entry(
  overrides: Partial<SettingRegistryEntry> & { readonly key: string },
): SettingRegistryEntry {
  return {
    description: "Test double",
    categoryId: "private.ticket",
    categoryIcon: "ticket",
    categoryPriority: 100,
    valueType: "boolean",
    visibility: "private",
    isRequired: true,
    defaultValue: false,
    value: null,
    isSet: false,
    titleKey: `settings.registry.keys.${overrides.key}`,
    helpKey: `settings.registry.help.${overrides.key}`,
    group: null,
    requires: [],
    ...overrides,
  };
}

const moduleEntry = entry({ key: "test.module", defaultValue: true, value: true });
const transport = entry({
  key: "test.module.ws",
  defaultValue: true,
  value: null,
  requires: [{ key: "test.module", equals: true }],
});
const url = entry({
  key: "test.url",
  valueType: "string",
  isRequired: false,
  defaultValue: "",
  value: "",
});
const live = entry({
  key: "test.live",
  requires: [
    { key: "test.module", equals: true },
    { key: "test.url", notEmpty: true },
  ],
});
const secret = entry({
  key: "test.secret",
  visibility: "secret",
  valueType: "string",
  isRequired: false,
  defaultValue: null,
  value: null,
});

const entries = [moduleEntry, transport, url, live, secret];

describe("setting dependency model", () => {
  it("reads the effective value: stored value wins over the default", () => {
    expect(readEffectiveValue(moduleEntry)).toBe(true);
    expect(readEffectiveValue(entry({ key: "x", value: false, defaultValue: true }))).toBe(false);
    expect(readEffectiveValue(entry({ key: "y", value: null, defaultValue: true }))).toBe(true);
    expect(readEffectiveValue(secret)).toBeNull();
  });

  it("treats true, a positive number and non-blank text as active", () => {
    expect(isSettingActive(moduleEntry)).toBe(true);
    expect(isSettingActive(entry({ key: "n", valueType: "number", value: 5, defaultValue: 0 }))).toBe(true);
    expect(isSettingActive(entry({ key: "n", valueType: "number", value: 0, defaultValue: 5 }))).toBe(false);
    expect(isSettingActive(entry({ key: "s", valueType: "string", value: "  ", defaultValue: "x" }))).toBe(false);
    expect(isSettingActive(entry({ key: "s", valueType: "string", value: "https://x", defaultValue: "" }))).toBe(true);
    // A secret counts as on when a value exists at all (it is never readable here).
    expect(isSettingActive(secret)).toBe(false);
    expect(isSettingActive({ ...secret, isSet: true })).toBe(true);
  });

  it("evaluates every condition shape against the effective value", () => {
    expect(isConditionMet({ key: "test.module", equals: true }, moduleEntry)).toBe(true);
    expect(isConditionMet({ key: "test.module", equals: false }, moduleEntry)).toBe(false);
    expect(isConditionMet({ key: "test.module", oneOf: [true, false] }, moduleEntry)).toBe(true);
    expect(isConditionMet({ key: "test.url", notEmpty: true }, url)).toBe(false);
    expect(isConditionMet({ key: "test.secret", isSet: true }, secret)).toBe(false);
    expect(isConditionMet({ key: "test.secret", isSet: true }, { ...secret, isSet: true })).toBe(true);
    expect(isConditionMet({ key: "test.missing", equals: true }, null)).toBe(false);
  });

  it("lists the blocking parents of a save in declaration order", () => {
    expect(describeUnmetRequirements(live, entries)).toEqual(["test.url"]);
    expect(
      describeUnmetRequirements(live, [entry({ key: "test.module", value: false, defaultValue: true }), url, secret]),
    ).toEqual(["test.module", "test.url"]);
  });

  it("allows switching off and refuses switching on without the parents", () => {
    expect(
      findBlockingParents({ entry: live, entries, nextValue: true }),
    ).toEqual(["test.url"]);
    expect(
      findBlockingParents({ entry: live, entries, nextValue: false }),
    ).toEqual([]);
    // The URL is fine to set first: nothing blocks filling a field in.
    expect(
      findBlockingParents({ entry: url, entries, nextValue: "https://x.example.com" }),
    ).toEqual([]);
  });

  it("finds the direct dependents of a key in registry order", () => {
    expect(listDirectDependents(entries, "test.module").map((item) => item.key)).toEqual([
      "test.module.ws",
      "test.live",
    ]);
    expect(listDirectDependents(entries, "test.secret")).toEqual([]);
  });
});

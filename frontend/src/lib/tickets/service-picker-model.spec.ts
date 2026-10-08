import { describe, expect, it } from "vitest";
import type { ServiceResponse } from "@/services/service-catalog-api";
import {
  buildServiceChips,
  buildServiceGroups,
  foldSearchText,
  matchesServiceQuery,
  pushRecentService,
  recentGroupKey,
  uncategorizedKey,
} from "./service-picker-model";

function service(id: string, name: string, category: { id: string; name: string; sortOrder: number } | null): ServiceResponse {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    categoryId: category?.id ?? "missing",
    category: category === null ? null : { name: category.name, sortOrder: category.sortOrder },
  } as unknown as ServiceResponse;
}

const it_ = { id: "c-it", name: "IT podrška", sortOrder: 1 };
const hr = { id: "c-hr", name: "Ljudski resursi", sortOrder: 0 };
const services = [
  service("s1", "Reset šifre", it_),
  service("s2", "Pristup VPN-u", it_),
  service("s3", "Godišnji odmor", hr),
  service("s4", "Opšti zahtjev", null),
];

describe("service picker model", () => {
  it("folds diacritics and đ", () => {
    expect(foldSearchText("Đurđa Šifra")).toBe("durda sifra");
    expect(matchesServiceQuery(services[0]!, "sifra")).toBe(false);
    expect(matchesServiceQuery(services[0]!, "sifre")).toBe(true);
    expect(matchesServiceQuery(services[1]!, "vpn pristup")).toBe(true);
  });

  it("matches the category name too", () => {
    expect(matchesServiceQuery(services[2]!, "resursi")).toBe(true);
  });

  it("orders groups by category sort order, uncategorised last", () => {
    const groups = buildServiceGroups({ services, query: "", categoryKey: null, recentIds: [] });
    expect(groups.map((group) => group.key)).toEqual(["c-hr", "c-it", uncategorizedKey]);
    expect(groups[1]!.services.map((item) => item.name)).toEqual(["Pristup VPN-u", "Reset šifre"]);
  });

  it("puts recent services first only on the untouched list", () => {
    const groups = buildServiceGroups({ services, query: "", categoryKey: null, recentIds: ["s3", "gone", "s1"] });
    expect(groups[0]!.key).toBe(recentGroupKey);
    expect(groups[0]!.services.map((item) => item.id)).toEqual(["s3", "s1"]);
    const searched = buildServiceGroups({ services, query: "vpn", categoryKey: null, recentIds: ["s3"] });
    expect(searched.map((group) => group.key)).toEqual(["c-it"]);
  });

  it("narrows by category chip and counts chips after the search", () => {
    const groups = buildServiceGroups({ services, query: "", categoryKey: "c-it", recentIds: ["s3"] });
    expect(groups.map((group) => group.key)).toEqual(["c-it"]);
    const chips = buildServiceChips(services, "o");
    expect(chips.find((chip) => chip.key === "c-hr")?.count).toBe(1);
  });

  it("keeps at most five recent ids, most recent first, no duplicates", () => {
    let recent: readonly string[] = [];
    for (const id of ["a", "b", "c", "d", "e", "f", "c"]) recent = pushRecentService(recent, id);
    expect(recent).toEqual(["c", "f", "e", "d", "b"]);
  });
});

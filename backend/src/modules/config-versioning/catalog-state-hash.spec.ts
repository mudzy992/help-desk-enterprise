import { computeCatalogStateHash } from "./catalog-state-hash";

describe("computeCatalogStateHash", () => {
  it("is stable across row order and object key order", () => {
    const services = [
      {
        id: "service-b",
        name: "B",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      {
        name: "A",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        id: "service-a",
      },
    ];
    const forms = [
      { id: "form-b", schema: { z: 2, a: 1 } },
      { schema: { a: 1, z: 2 }, id: "form-a" },
    ];

    expect(computeCatalogStateHash(services, forms)).toBe(
      computeCatalogStateHash([...services].reverse(), [...forms].reverse()),
    );
  });

  it("changes when a persisted row version or field changes", () => {
    const service = {
      id: "service-a",
      name: "A",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const forms = [{ id: "form-a", schema: { schemaVersion: 1, fields: [] } }];

    expect(
      computeCatalogStateHash(
        [{ ...service, updatedAt: new Date("2026-01-01T00:00:00.001Z") }],
        forms,
      ),
    ).not.toBe(computeCatalogStateHash([service], forms));
    expect(
      computeCatalogStateHash([{ ...service, name: "renamed" }], forms),
    ).not.toBe(computeCatalogStateHash([service], forms));
  });
});

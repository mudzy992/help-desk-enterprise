import { createConfigSnapshotFixture } from "./create-config-snapshot-fixture";
import { validateCatalogDomainSnapshot } from "./validate-catalog-domain-snapshot";

describe("validateCatalogDomainSnapshot", () => {
  it("rejects multiple ACTIVE form versions when the target setting disallows them", () => {
    const snapshot = createConfigSnapshotFixture({
      forms: {
        versions: [
          ...createConfigSnapshotFixture().forms.versions,
          {
            id: "form-2",
            serviceId: "service-vpn",
            version: 2,
            status: "ACTIVE",
            schema: {
              schemaVersion: 1,
              fields: [
                {
                  id: "summary",
                  label: "Summary",
                  type: "text",
                  required: true,
                  order: 0,
                },
              ],
            },
          },
        ],
      },
    });

    expect(validateCatalogDomainSnapshot(snapshot)).toContainEqual(
      expect.objectContaining({
        code: "MULTIPLE_ACTIVE_FORM_VERSIONS",
        path: "catalog.services.service-vpn.forms",
      }),
    );
  });

  it("requires every ACTIVE service to have an ACTIVE form, independent of the optional validator flag", () => {
    const snapshot = createConfigSnapshotFixture({
      forms: { versions: [] },
    });

    expect(validateCatalogDomainSnapshot(snapshot)).toContainEqual(
      expect.objectContaining({
        code: "NO_ACTIVE_FORM_VERSION",
        path: "catalog.services.service-vpn.form",
      }),
    );
  });

  it("rejects duplicate or non-canonical service slugs in the proposed state", () => {
    const base = createConfigSnapshotFixture();
    const service = base.catalog.services[0]!;
    const snapshot = createConfigSnapshotFixture({
      catalog: {
        services: [service, { ...service, id: "service-other", name: "Other" }],
      },
      forms: {
        versions: [
          ...base.forms.versions,
          {
            ...base.forms.versions[0]!,
            id: "form-other",
            serviceId: "service-other",
            version: 1,
          },
        ],
      },
    });

    expect(validateCatalogDomainSnapshot(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_SERVICE_SLUG" }),
      ]),
    );
  });
});

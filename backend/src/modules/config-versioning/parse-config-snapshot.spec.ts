import { createConfigSnapshotFixture } from "./create-config-snapshot-fixture";
import { ConfigVersioningError } from "./config-versioning.error";
import { configVersioningErrorCodes } from "./config-versioning.constants";
import { parseConfigSnapshot } from "./parse-config-snapshot";

describe("parseConfigSnapshot catalog precondition", () => {
  it("accepts legacy snapshots without a catalog hash for no-op compatibility", () => {
    const parsed = parseConfigSnapshot(createConfigSnapshotFixture());

    expect(parsed.catalogStateHash).toBeUndefined();
  });

  it("parses BA-templates-06 scopes and ordered steps through the whole snapshot parser", () => {
    const templates = {
      responseTemplates: [{
        id: "template-1",
        name: "VPN reply",
        bodyBs: "Pozdrav {ticketNumber}",
        bodyEn: null,
        kind: "REPLY" as const,
        tags: ["support"],
        isActive: true,
        deletedAt: null,
        scope: { serviceIds: ["service-vpn"], categoryIds: ["cat-1"], groupIds: ["group-it"] },
      }],
      playbooks: [{
        id: "playbook-1",
        name: "VPN checklist",
        description: null,
        isActive: true,
        version: 2,
        deletedAt: null,
        scope: { serviceIds: ["service-vpn"], categoryIds: ["cat-1"] },
        steps: [{
          stepKey: "verify_access",
          position: 0,
          title: "Verify access",
          instructions: null,
          required: true,
          knowledgeArticleId: "article-1",
          responseTemplateId: "template-1",
        }],
      }],
    };
    const parsed = parseConfigSnapshot(createConfigSnapshotFixture({ templates }));

    expect(parsed.templates).toEqual(templates);
  });

  it("round-trips a well-formed SHA-256 catalog hash", () => {
    const hash = "A".repeat(64);
    const parsed = parseConfigSnapshot({
      ...createConfigSnapshotFixture(),
      catalogStateHash: hash,
    });

    expect(parsed.catalogStateHash).toBe(hash.toLowerCase());
  });

  it("rejects malformed catalog hash values", () => {
    expect(() =>
      parseConfigSnapshot({
        ...createConfigSnapshotFixture(),
        catalogStateHash: "not-a-hash",
      }),
    ).toThrow(ConfigVersioningError);
    try {
      parseConfigSnapshot({
        ...createConfigSnapshotFixture(),
        catalogStateHash: "not-a-hash",
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: configVersioningErrorCodes.invalidSnapshot,
      });
    }
  });
});

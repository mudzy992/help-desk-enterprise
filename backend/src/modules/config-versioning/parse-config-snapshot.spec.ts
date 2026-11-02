import { createConfigSnapshotFixture } from "./create-config-snapshot-fixture";
import { ConfigVersioningError } from "./config-versioning.error";
import { configVersioningErrorCodes } from "./config-versioning.constants";
import { parseConfigSnapshot } from "./parse-config-snapshot";

describe("parseConfigSnapshot catalog precondition", () => {
  it("accepts legacy snapshots without a catalog hash for no-op compatibility", () => {
    const parsed = parseConfigSnapshot(createConfigSnapshotFixture());

    expect(parsed.catalogStateHash).toBeUndefined();
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

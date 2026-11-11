import { settingKeys } from "../setting-keys";
import { inboundEmailSettings } from "./inbound-email-settings";

const trustedAuthservId = inboundEmailSettings.find(
  (definition) =>
    definition.key === settingKeys.privateInboundTrustedAuthservId,
)! as (typeof inboundEmailSettings)[number] & {
  defaultValue?: unknown;
};

describe("inbound email trusted authserv-id setting", () => {
  it("defaults to empty so sender authentication remains fail-closed until configured", () => {
    expect(trustedAuthservId.defaultValue).toBe("");
    expect(trustedAuthservId.isRequired).toBe(false);
  });

  it("accepts one exact DNS-style authserv-id and rejects wildcards or header fragments", () => {
    expect(() =>
      trustedAuthservId.assertValue!("mx.example.com"),
    ).not.toThrow();
    expect(() =>
      trustedAuthservId.assertValue!("MX.Example.com."),
    ).not.toThrow();
    expect(() => trustedAuthservId.assertValue!("")).not.toThrow();
    expect(() => trustedAuthservId.assertValue!("*.example.com")).toThrow(
      "without a wildcard",
    );
    expect(() =>
      trustedAuthservId.assertValue!("mx.example.com; dmarc=pass"),
    ).toThrow("without a wildcard");
  });
});

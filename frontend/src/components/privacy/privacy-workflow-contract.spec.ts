import { describe, expect, it } from "vitest";
import {
  blockerKey,
  countKey,
  describeErasureError,
} from "@/components/privacy/privacy-anonymization-details";
import { channelKey, requestTypeKey } from "@/components/privacy/privacy-request-detail-sheet";

describe("privacy workflow presentation contract", () => {
  it("keeps request and anonymization translation keys stable", () => {
    expect(requestTypeKey("ERASURE")).toBe("privacy.requests.type.ERASURE");
    expect(channelKey("IN_PERSON")).toBe("privacy.requests.channel.IN_PERSON");
    expect(blockerKey("legal_hold")).toBe("privacy.anonymization.blockers.legal_hold");
    expect(countKey("tickets")).toBe("privacy.counts.tickets");
  });

  it("expands stored blocker codes while preserving unknown worker errors", () => {
    expect(describeErasureError("blocked:active,legal_hold", (reason) => `label:${reason}`)).toBe(
      "label:active · label:legal_hold",
    );
    expect(describeErasureError("worker_failed", (reason) => reason)).toBe("worker_failed");
  });
});

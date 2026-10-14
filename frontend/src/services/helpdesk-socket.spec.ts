import { describe, expect, it } from "vitest";
import { createHelpdeskSocketOptions, helpdeskSocketReconnect } from "@/services/helpdesk-socket";

/**
 * Faza 3.1 (plan §3.1): the socket must keep working exactly as before (same auth
 * handshake, same auto-connect) with one addition — jittered reconnects, so a
 * deploy does not make every client reconnect on the same millisecond.
 */
describe("createHelpdeskSocketOptions", () => {
  it("authenticates with the session cookie and keeps auto-connect behaviour", () => {
    const options = createHelpdeskSocketOptions();
    expect(options.withCredentials).toBe(true);
    expect(options.auth).toBeUndefined();
    expect(options.autoConnect).toBe(true);
    expect(options.reconnection).toBe(true);
  });

  it("jitters the reconnect delay", () => {
    expect(helpdeskSocketReconnect.reconnectionDelay).toBe(500);
    expect(helpdeskSocketReconnect.reconnectionDelayMax).toBe(10_000);
    expect(helpdeskSocketReconnect.randomizationFactor).toBeGreaterThan(0);
    expect(helpdeskSocketReconnect.randomizationFactor).toBeLessThanOrEqual(1);
    const options = createHelpdeskSocketOptions();
    expect(options.randomizationFactor).toBe(helpdeskSocketReconnect.randomizationFactor);
  });
});

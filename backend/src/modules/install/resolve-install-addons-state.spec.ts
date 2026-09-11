import { resolveInstallAddonsState } from './resolve-install-addons-state';

describe('resolveInstallAddonsState', () => {
  it('uses catalog defaults when nothing is stored or requested', () => {
    const resolved = resolveInstallAddonsState({
      smtpEnabled: false,
      stored: {},
      requested: {},
    });
    expect(resolved.sla).toBe(true);
    expect(resolved.email).toBe(false);
    expect(resolved.edge).toBe(false);
    expect(resolved.teamsStub).toBe(false);
    expect(resolved.csat).toBe(true);
    expect(resolved.autoAssign).toBe(false);
    expect(resolved.approvals).toBe(true);
    expect(resolved.confidential).toBe(true);
    expect(resolved.kbIntercept).toBe(true);
    expect(resolved.timeTracking).toBe(true);
    expect(resolved.ticketSplit).toBe(true);
    expect(resolved.bulkActions).toBe(true);
    expect(resolved.savedViews).toBe(true);
    expect(resolved.reports).toBe(true);
    expect(resolved.serviceDowntime).toBe(true);
  });

  it('applies requested enable and disable over stored values', () => {
    const resolved = resolveInstallAddonsState({
      smtpEnabled: true,
      stored: { sla: true, autoAssign: false, email: false },
      requested: { sla: false, autoAssign: true, email: true },
    });
    expect(resolved.sla).toBe(false);
    expect(resolved.autoAssign).toBe(true);
    expect(resolved.email).toBe(true);
  });

  it('forces email off when SMTP is off even if requested on', () => {
    expect(
      resolveInstallAddonsState({
        smtpEnabled: false,
        stored: { email: true },
        requested: { email: true },
      }).email,
    ).toBe(false);
  });

  it('is deterministic for the same input', () => {
    const input = {
      smtpEnabled: true,
      stored: { edge: true },
      requested: { csat: false, edge: true },
    };
    expect(resolveInstallAddonsState(input)).toEqual(
      resolveInstallAddonsState(input),
    );
  });
});

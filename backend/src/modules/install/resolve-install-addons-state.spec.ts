import { installAddonCatalog } from '../settings/addon-catalog';
import { resolveInstallAddonsState } from './resolve-install-addons-state';

describe('resolveInstallAddonsState', () => {
  it('uses catalog defaults when nothing is stored or requested', () => {
    const resolved = resolveInstallAddonsState({
      smtpEnabled: false,
      stored: {},
      requested: {},
    });
    // Val 5: umjesto ručnog spiska (koji je zaostajao za katalogom) provjerava se
    // tačno ono što katalog nudi — jedan izvor istine.
    for (const item of installAddonCatalog) {
      expect([item.key, resolved[item.key]]).toEqual([item.key, item.defaultEnabled]);
    }
  });

  it('applies requested enable and disable over stored values', () => {
    const resolved = resolveInstallAddonsState({
      smtpEnabled: true,
      stored: { approvals: true, cmdb: false, email: false },
      requested: { approvals: false, cmdb: true, email: true },
    });
    expect(resolved.approvals).toBe(false);
    expect(resolved.cmdb).toBe(true);
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

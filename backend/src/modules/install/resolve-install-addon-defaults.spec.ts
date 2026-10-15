import { installAddonCatalog } from '../settings/addon-catalog';
import { resolveInstallAddonDefaults } from './resolve-install-addon-defaults';

/**
 * F4.5 / owner decision 4: the package decides what the wizard switches on. The
 * catalog already defaults to the „day one“ feature set; what the packages add on
 * top is CMDB, problems and changes in Full — and Full must not lose what Standard
 * promises.
 */
const defaultOf = (profile: 'minimum' | 'standard' | 'full' | null) =>
  resolveInstallAddonDefaults(profile);

describe('resolveInstallAddonDefaults', () => {
  it('answers with the catalog default while no package is chosen', () => {
    const defaults = defaultOf(null);

    expect(defaults).toEqual(
      Object.fromEntries(installAddonCatalog.map((item) => [item.key, item.defaultEnabled])),
    );
    expect(defaults.minimum).toBeUndefined();
    expect(defaults.csat).toBe(true);
    expect(defaults.cmdb).toBe(false);
  });

  it('turns the ITSM modules on in Full and only there', () => {
    expect(defaultOf('minimum').cmdb).toBe(false);
    expect(defaultOf('minimum').problems).toBe(false);
    expect(defaultOf('minimum').changes).toBe(false);

    expect(defaultOf('standard').cmdb).toBe(false);
    expect(defaultOf('standard').problems).toBe(false);

    expect(defaultOf('full').cmdb).toBe(true);
    expect(defaultOf('full').problems).toBe(true);
    expect(defaultOf('full').changes).toBe(true);
  });

  it('keeps what the smaller package promised (packages are cumulative)', () => {
    const standard = defaultOf('standard');
    const full = defaultOf('full');

    for (const key of ['csat', 'approvals', 'confidential', 'reports', 'savedViews']) {
      expect(full[key]).toBe(true);
      expect(standard[key]).toBe(true);
    }
    // A key no package mentions keeps the catalog answer.
    expect(full.edge).toBe(false);
    expect(full.teams).toBe(false);
  });
});

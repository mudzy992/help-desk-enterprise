import { knownOpsAlertKeys } from './ops-alert.engine';
import { opsAlertCatalog, opsAlertKeys } from './ops-alert-catalog';

/*
  Guard for the alarm catalogue. Every alarm arrives as an e-mail, a Teams card
  and a fallback message, so a key without wording shows a blank line to the
  operator at the worst possible moment; a definition without hysteresis flaps;
  a runbook anchor that does not exist sends the reader nowhere.

  The list is checked against `knownOpsAlertKeys` (what the engine really
  evaluates) so a definition that is never observed fails here too, instead of
  sitting in the catalogue looking healthy.
*/
describe('opsAlertCatalog', () => {
  const keys = Object.keys(opsAlertCatalog) as Array<keyof typeof opsAlertCatalog>;

  it('covers every key the engine knows and nothing else', () => {
    expect([...keys].sort()).toEqual([...knownOpsAlertKeys].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(Object.values(opsAlertKeys))('%s is complete in both languages', (key) => {
    const definition = opsAlertCatalog[key];
    expect(definition.key).toBe(key);
    for (const locale of ['bs', 'en'] as const) {
      expect(definition.title[locale]?.trim().length ?? 0).toBeGreaterThan(0);
      expect(definition.action[locale]?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it.each(Object.values(opsAlertKeys))('%s waits for a signal and points at a runbook', (key) => {
    const definition = opsAlertCatalog[key];
    // An alarm that fires on one sample flaps; one that takes an hour to open
    // is blind. 1-3 checks (one per minute) is the whole range in use.
    expect(definition.openAfter).toBeGreaterThanOrEqual(1);
    expect(definition.openAfter).toBeLessThanOrEqual(3);
    expect(definition.resolveAfter).toBeGreaterThanOrEqual(1);
    expect(definition.runbook).toMatch(/^ops\/runbook\/ALERTS\.md#[a-z0-9-]+$/);
  });
});

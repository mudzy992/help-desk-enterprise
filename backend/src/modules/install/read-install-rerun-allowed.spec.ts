import { assertInstallRerunAllowed, readInstallRerunAllowed } from './read-install-rerun-allowed';

describe('readInstallRerunAllowed (owner decision 6)', () => {
  it('accepts exactly the value true, in any case and with whitespace', () => {
    expect(readInstallRerunAllowed({ INSTALL_ALLOW_RERUN: 'true' })).toBe(true);
    expect(readInstallRerunAllowed({ INSTALL_ALLOW_RERUN: ' TRUE ' })).toBe(true);
  });

  it('treats everything else as off', () => {
    expect(readInstallRerunAllowed({})).toBe(false);
    expect(readInstallRerunAllowed({ INSTALL_ALLOW_RERUN: '' })).toBe(false);
    expect(readInstallRerunAllowed({ INSTALL_ALLOW_RERUN: '1' })).toBe(false);
    expect(readInstallRerunAllowed({ INSTALL_ALLOW_RERUN: 'yes' })).toBe(false);
    expect(readInstallRerunAllowed({ INSTALL_ALLOW_RERUN: 'false' })).toBe(false);
  });

  it('refuses the rerun with the variable the operator has to set', () => {
    let caught: unknown;
    try {
      assertInstallRerunAllowed({});
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: 'INSTALL_RERUN_NOT_ALLOWED' });
    expect((caught as Error).message).toContain('INSTALL_ALLOW_RERUN=true');
  });

  it('stays quiet while the switch is on', () => {
    expect(() => assertInstallRerunAllowed({ INSTALL_ALLOW_RERUN: 'true' })).not.toThrow();
  });
});

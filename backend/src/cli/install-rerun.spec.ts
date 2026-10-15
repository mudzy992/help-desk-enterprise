import { readInstallRerunCliInput } from './install-rerun';

describe('install-rerun CLI input', () => {
  const allowed = { INSTALL_ALLOW_RERUN: 'true' };

  it('refuses to run while the ops switch is off', () => {
    expect(() => readInstallRerunCliInput(['--reason', 'demo'], {})).toThrow(
      /INSTALL_ALLOW_RERUN=true/,
    );
  });

  it('requires a reason for the change log', () => {
    expect(() => readInstallRerunCliInput([], allowed)).toThrow(/Usage:/);
    expect(() => readInstallRerunCliInput(['--reason', 'ab'], allowed)).toThrow(/Usage:/);
    // `--reason --dry-run` is a missing value, not a reason called „--dry-run“.
    expect(() => readInstallRerunCliInput(['--reason', '--dry-run'], allowed)).toThrow(/Usage:/);
  });

  it('reads the switches the runbook documents', () => {
    expect(
      readInstallRerunCliInput(
        ['--reason', 'Demo paketa', '--include-step-markers', '--dry-run'],
        allowed,
      ),
    ).toEqual({
      reason: 'Demo paketa',
      includeStepMarkers: true,
      dryRun: true,
    });
    expect(readInstallRerunCliInput(['--reason', 'Demo paketa'], allowed)).toEqual({
      reason: 'Demo paketa',
      includeStepMarkers: false,
      dryRun: false,
    });
  });
});

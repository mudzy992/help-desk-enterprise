import { computeChangeQuorum } from './change-cab';

describe('quorum bounds (W7.77)', () => {
  it('needs no quorum for a standard change', () => {
    expect(computeChangeQuorum('STANDARD', { normalQuorum: 5, emergencyQuorum: 5 }, 4)).toBe(0);
  });

  it('never asks for more approvals than there are voters', () => {
    expect(computeChangeQuorum('NORMAL', { normalQuorum: 3, emergencyQuorum: 1 }, 2)).toBe(2);
    expect(computeChangeQuorum('NORMAL', { normalQuorum: 20, emergencyQuorum: 1 }, 7)).toBe(7);
  });

  it('clamps a stored setting that slipped past the settings layer', () => {
    expect(computeChangeQuorum('NORMAL', { normalQuorum: 1_000_000, emergencyQuorum: 1 }, 100)).toBe(20);
    expect(computeChangeQuorum('NORMAL', { normalQuorum: -4, emergencyQuorum: 1 }, 5)).toBe(1);
    expect(computeChangeQuorum('EMERGENCY', { normalQuorum: 2, emergencyQuorum: 999 }, 100)).toBe(20);
  });

  it('is still at least one, so a zero cannot approve by itself', () => {
    expect(computeChangeQuorum('NORMAL', { normalQuorum: 0, emergencyQuorum: 0 }, 3)).toBe(1);
  });

  it('survives a broken setting instead of producing a NaN quorum', () => {
    // A NaN quorum made `evaluateChangeVotes` return PENDING forever, so the round never finished; the documented
    // default is the way out.
    expect(computeChangeQuorum('NORMAL', { normalQuorum: Number.NaN, emergencyQuorum: 1 }, 3)).toBe(2);
    expect(computeChangeQuorum('NORMAL', { normalQuorum: 3.7, emergencyQuorum: 1 }, 3)).toBe(2);
    expect(computeChangeQuorum('EMERGENCY', { normalQuorum: 2, emergencyQuorum: Number.NaN }, 3)).toBe(1);
  });

  it('cannot promise a quorum when nobody may vote', () => {
    // A round without voters cannot be approved; the caller turns this into CHANGE_NO_APPROVERS rather than a quorum
    // that is silently satisfied.
    expect(computeChangeQuorum('NORMAL', { normalQuorum: 2, emergencyQuorum: 1 }, 0)).toBe(1);
    expect(computeChangeQuorum('NORMAL', { normalQuorum: 2, emergencyQuorum: 1 }, Number.NaN)).toBe(1);
  });
});

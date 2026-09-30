import { randomBytes } from 'node:crypto';
import { decryptLicenseKey, encryptLicenseKey, readLicenseKeyCipherKey } from './asset-license-cipher';
import { licenseAssignmentTarget, licenseCompliance } from './asset-licenses.service';

describe('licences (paket 3.2 §9)', () => {
  it('counts seats except for site licences and flags over-allocation', () => {
    expect(licenseCompliance('PER_DEVICE', 10, 4)).toEqual({ used: 4, seats: 10, available: 6, overAllocated: false });
    expect(licenseCompliance('PER_USER', 2, 3)).toEqual({ used: 3, seats: 2, available: -1, overAllocated: true });
    expect(licenseCompliance('SITE', null, 99)).toEqual({ used: 99, seats: null, available: null, overAllocated: false });
  });

  it('maps the kind to the assignment side', () => {
    expect(licenseAssignmentTarget('PER_DEVICE')).toBe('asset');
    expect(licenseAssignmentTarget('PER_USER')).toBe('user');
    expect(licenseAssignmentTarget('SUBSCRIPTION')).toBe('either');
    expect(licenseAssignmentTarget('SITE')).toBe('none');
  });

  it('encrypts keys with a key derived from MFA_ENCRYPTION_KEY', () => {
    const env = { MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64') } as NodeJS.ProcessEnv;
    const key = readLicenseKeyCipherKey(env);
    expect(key).not.toBeNull();
    const stored = encryptLicenseKey('ABCDE-12345-FGHIJ', key);
    expect(stored).not.toContain('ABCDE');
    expect(decryptLicenseKey(stored, key)).toBe('ABCDE-12345-FGHIJ');
    // The derived key differs from the MFA key itself.
    expect(key?.equals(Buffer.from(env.MFA_ENCRYPTION_KEY as string, 'base64'))).toBe(false);
  });

  it('has no key without MFA_ENCRYPTION_KEY', () => {
    expect(readLicenseKeyCipherKey({} as NodeJS.ProcessEnv)).toBeNull();
    expect(() => encryptLicenseKey('x', null)).toThrow();
  });
});

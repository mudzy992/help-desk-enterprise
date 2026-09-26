import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCaCertificate } from './ldap-directory-client';

const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';

describe('readCaCertificate', () => {
  it('returns null when nothing is configured', () => {
    expect(readCaCertificate(undefined, undefined)).toBeNull();
    expect(readCaCertificate('  ', '')).toBeNull();
  });

  it('decodes inline base64 PEM, tolerating whitespace', () => {
    const encoded = Buffer.from(pem).toString('base64');
    const wrapped = `${encoded.slice(0, 10)}\n ${encoded.slice(10)}`;
    expect(readCaCertificate(undefined, wrapped)).toBe(pem);
  });

  it('prefers the file path over inline base64', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ca-')), 'ca.pem');
    writeFileSync(file, pem);
    expect(readCaCertificate(file, 'Z2FyYmFnZQ==')).toBe(pem);
  });

  it('rejects values that are not PEM', () => {
    expect(() => readCaCertificate(undefined, Buffer.from('garbage').toString('base64'))).toThrow();
  });
});

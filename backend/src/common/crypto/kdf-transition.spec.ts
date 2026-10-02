import { hkdfSync, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  decryptLicenseKey,
  encryptLicenseKey,
  needsLicenseRekey,
  readLicenseKeyCipherKey,
  readLicenseKeyDecryptionKeys,
} from '../../modules/assets/asset-license-cipher';
import {
  createReplyTokenMessageId,
  deriveReplyTokenSecret,
  findReplyToken,
  readReplyTokenSecret,
  readReplyTokenVerificationSecrets,
} from '../../modules/notifications/email/reply-token';
import { computeTombstones, deriveTombstoneKey, readTombstoneKey, readTombstoneMatchKeys } from '../../modules/privacy/anonymization/tombstones';
import {
  createExportDecryptStream,
  createExportEncryptStream,
  deriveExportMasterKey,
  readExportDecryptionKeys,
} from '../../modules/privacy/export/export-cipher';
import { kdfLabels } from './kdf-labels';
import { legacyKdfLabels } from './legacy-kdf-labels';

const env = { MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64') } as NodeJS.ProcessEnv;
const master = Buffer.from(env.MFA_ENCRYPTION_KEY as string, 'base64');

async function roundTrip(encryptKey: Buffer, decryptKeys: readonly Buffer[], plain: string): Promise<string> {
  const encrypted: Buffer[] = [];
  for await (const chunk of Readable.from([Buffer.from(plain)]).pipe(createExportEncryptStream(encryptKey))) encrypted.push(chunk as Buffer);
  const decrypted: Buffer[] = [];
  for await (const chunk of Readable.from([Buffer.concat(encrypted)]).pipe(createExportDecryptStream(decryptKeys))) decrypted.push(chunk as Buffer);
  return Buffer.concat(decrypted).toString();
}

describe('Paket 4.1: KDF v2 with v1 transition', () => {
  it('labels are distinct and v2 is product-neutral', () => {
    for (const label of Object.values(kdfLabels)) expect(label).toMatch(/^service-desk:.+:v2$/);
    expect(new Set([...Object.values(kdfLabels), ...Object.values(legacyKdfLabels)]).size).toBe(8);
  });

  it('licence keys: new ones use v2, v1 ones still open and are flagged for rekey', () => {
    const v1 = Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), legacyKdfLabels.assetLicenseKeyV1, 32));
    const legacyStored = encryptLicenseKey('ABCD-1234', v1);
    const freshStored = encryptLicenseKey('WXYZ-9876', readLicenseKeyCipherKey(env));
    expect(decryptLicenseKey(legacyStored, readLicenseKeyDecryptionKeys(env))).toBe('ABCD-1234');
    expect(needsLicenseRekey(legacyStored, env)).toBe(true);
    expect(needsLicenseRekey(freshStored, env)).toBe(false);
    expect(() => decryptLicenseKey(legacyStored, readLicenseKeyCipherKey(env))).toThrow();
  });

  it('reply tokens: v1-signed replies still verify, also after an explicit secret is pinned', () => {
    const v1 = deriveReplyTokenSecret(env, legacyKdfLabels.inboundReplyTokenV1) as Buffer;
    const messageId = createReplyTokenMessageId({ secret: v1, ticketId: 'ticket0001', recipientId: 'user000001', dedupeKey: 'd', domain: 'example.com' }) as string;
    expect(readReplyTokenSecret(env)?.equals(v1)).toBe(false);
    expect(findReplyToken([messageId], readReplyTokenVerificationSecrets(env))).toEqual({ ticketId: 'ticket0001', recipientId: 'user000001' });
    const explicit = { ...env, INBOUND_EMAIL_TOKEN_SECRET: randomBytes(32).toString('base64') };
    expect(findReplyToken([messageId], readReplyTokenVerificationSecrets(explicit))).not.toBeNull();
    const otherMaster = { INBOUND_EMAIL_TOKEN_SECRET: explicit.INBOUND_EMAIL_TOKEN_SECRET } as NodeJS.ProcessEnv;
    expect(findReplyToken([messageId], readReplyTokenVerificationSecrets(otherMaster))).toBeNull();
  });

  it('tombstones: new ones use v2, v1 ones keep matching', () => {
    const v1 = deriveTombstoneKey(env, legacyKdfLabels.privacyTombstoneV1) as Buffer;
    const old = computeTombstones(v1, { email: 'ana@example.com' })[0];
    expect(computeTombstones(readTombstoneKey(env) as Buffer, { email: 'ana@example.com' })[0]).not.toBe(old);
    const matches = readTombstoneMatchKeys(env).map((key) => computeTombstones(key, { email: 'ana@example.com' })[0]);
    expect(matches).toContain(old);
  });

  it('exports: v1-wrapped files still decrypt, new ones use v2', async () => {
    const v1 = deriveExportMasterKey(env, legacyKdfLabels.privacyExportV1) as Buffer;
    await expect(roundTrip(v1, readExportDecryptionKeys(env), 'staro')).resolves.toBe('staro');
    await expect(roundTrip(deriveExportMasterKey(env) as Buffer, readExportDecryptionKeys(env), 'novo')).resolves.toBe('novo');
    await expect(roundTrip(v1, [deriveExportMasterKey(env) as Buffer], 'x')).rejects.toThrow();
  });
});

import { decodeAuditCursor, encodeAuditCursor } from './audit-cursor';

describe('versioned audit cursor envelope', () => {
  it('round-trips an opaque audit id through canonical base64url', () => {
    const cursor = encodeAuditCursor('0192f7de-6ac7-7d91-b22e-3ae587ab0d42');
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(decodeAuditCursor(cursor)).toBe('0192f7de-6ac7-7d91-b22e-3ae587ab0d42');
  });

  it.each([
    'raw-row-id',
    Buffer.from(JSON.stringify({ v: 2, id: 'row-1' })).toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, id: 'bad/id' })).toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, id: 'row-1', extra: true })).toString('base64url'),
    'a'.repeat(257),
  ])('rejects malformed, unsupported, non-canonical or oversized input', (cursor) => {
    expect(() => decodeAuditCursor(cursor)).toThrow('AUDIT_INVALID_CURSOR');
  });

  it('preserves a null first-page cursor', () => {
    expect(decodeAuditCursor(null)).toBeNull();
  });
});

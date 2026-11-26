import { BadRequestException } from '@nestjs/common';
import { CuidParamPipe, cuidLength, isCuidParamValue } from './cuid-param.pipe';

/*
  W2.17 (`BA-authentication-04`): `ParseUUIDPipe` answered `400` for the ids the
  schema issues, so the session list offered a revoke button that could never work.
  The replacement has to accept exactly the shape Prisma generates and nothing
  unbounded, which is what these boundaries pin.
*/
describe('CuidParamPipe (W2.17)', () => {
  /** A real cuid, copied from a live response (`GET /auth/sessions`). */
  const realCuid = 'cmwwnqcx800itw31quqh0ny4r';

  const pipe = new CuidParamPipe('sessionId');

  function expectRejected(value: unknown): void {
    let error: unknown;
    try {
      pipe.transform(value as string);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_ID',
      message: 'sessionId is not a valid identifier',
    });
  }

  it('accepts the id the API itself lists', () => {
    expect(realCuid).toHaveLength(cuidLength);
    expect(pipe.transform(realCuid)).toBe(realCuid);
  });

  it('accepts the documented bounds (20..30 characters, lower-case base36 after c)', () => {
    for (const length of [20, 25, 30]) {
      const value = `c${'a'.repeat(length - 1)}`;
      expect(pipe.transform(value)).toBe(value);
    }
  });

  it('rejects values outside the bounds instead of passing them to the database', () => {
    expectRejected(`c${'a'.repeat(18)}`); // 19 characters
    expectRejected(`c${'a'.repeat(30)}`); // 31 characters
    expectRejected('');
    expectRejected('c');
  });

  it('rejects a UUID: the session registry never issues one', () => {
    // This is the exact regression: a UUID used to be the only accepted value.
    expectRejected('3f2504e0-4f89-11d3-9a0c-0305e82c3301');
    expect(isCuidParamValue('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(false);
  });

  it('rejects upper-case, stray symbols and non-strings', () => {
    expectRejected('CMWWNQCX800ITW31QUQH0NY4R');
    expectRejected('cmwwnqcx800itw31quqh0ny4!');
    expectRejected('cmwwnqcx800itw31quqh0ny4r\n');
    expectRejected(undefined);
    expectRejected(42);
  });

  it('names the parameter it refused, so one message serves every route', () => {
    let error: unknown;
    try {
      new CuidParamPipe('userId').transform('cmwwnqcx800itw31quqh0ny4r!');
    } catch (caught) {
      error = caught;
    }
    expect((error as BadRequestException).getResponse()).toMatchObject({
      message: 'userId is not a valid identifier',
    });
  });
});

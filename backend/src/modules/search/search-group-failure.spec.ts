import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { KnowledgeBaseError } from '../knowledge-base/knowledge-base.error';
import { TicketsError } from '../tickets/tickets.error';
import {
  classifySearchGroupFailure,
  isFatalSearchGroupFailure,
} from './search-group-failure';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * W7.62 (BA-search-08): the whole package rests on one line — which failures
 * may degrade to a partial group and which must fail the request. These cases
 * pin that line from both sides, using the error types the three groups
 * actually throw.
 */
describe('search group failure classification (W7.62)', () => {
  it('never degrades an authorization decision', () => {
    for (const error of [
      new ForbiddenException(),
      new UnauthorizedException(),
      new KnowledgeBaseError('FORBIDDEN'),
      new TicketsError('FORBIDDEN'),
      Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' }),
    ]) {
      expect(classifySearchGroupFailure(error)).toBe('authorization');
      expect(isFatalSearchGroupFailure(error)).toBe(true);
    }
  });

  it('treats other client errors as fatal too, because the client cannot act on them', () => {
    for (const error of [
      new BadRequestException('bad filter'),
      new KnowledgeBaseError('INVALID_CURSOR'),
      new HttpException({ code: 'CONFLICT' }, 409),
    ]) {
      expect(classifySearchGroupFailure(error)).toBe('client');
      expect(isFatalSearchGroupFailure(error)).toBe(true);
    }
  });

  it('degrades availability failures only', () => {
    for (const error of [
      new InternalServerErrorException('db down'),
      new ServiceUnavailableException('redis down'),
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      new Error('timeout'),
      'not even an error object',
      undefined,
    ]) {
      expect(classifySearchGroupFailure(error)).toBe('availability');
      expect(isFatalSearchGroupFailure(error)).toBe(false);
    }
  });

  it('does not degrade a 4xx that merely looks like an availability code', () => {
    // P2025 is a Prisma "record not found"; it is a programming error in a
    // search group, not an outage, so it must not become an empty group.
    const prismaLike = Object.assign(new Error('not found'), { code: 'P2025' });
    expect(classifySearchGroupFailure(prismaLike)).toBe('availability');
    // ...while a 401 carrying that code still fails the request.
    const unauthorized = Object.assign(new UnauthorizedException(), {
      code: 'P2025',
    });
    expect(classifySearchGroupFailure(unauthorized)).toBe('authorization');
  });
});

// The DTO is read through its decorators, so the metadata shim has to be in
// place before the module is imported (the app sets it up in `main.ts`).
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchQueryDto, toSearchQuery } from './search-query.dto';
import { searchConstants } from './search.constants';

async function validateQuery(raw: Record<string, unknown>) {
  const dto = plainToInstance(SearchQueryDto, raw);
  const errors = await validate(dto);
  return { dto, errors };
}

describe('GET /search query contract', () => {
  it('requires at least two characters', async () => {
    expect((await validateQuery({ q: 'v' })).errors).not.toHaveLength(0);
    expect((await validateQuery({})).errors).not.toHaveLength(0);
    expect((await validateQuery({ q: 'vp' })).errors).toHaveLength(0);
  });

  it('refuses a query longer than the ceiling', async () => {
    const tooLong = 'a'.repeat(searchConstants.maximumQueryLength + 1);
    expect((await validateQuery({ q: tooLong })).errors).not.toHaveLength(0);
  });

  it('accepts a limit inside 1–25 and refuses anything outside', async () => {
    expect((await validateQuery({ q: 'vpn', limit: 25 })).errors).toHaveLength(0);
    expect((await validateQuery({ q: 'vpn', limit: 1 })).errors).toHaveLength(0);
    expect((await validateQuery({ q: 'vpn', limit: 0 })).errors).not.toHaveLength(0);
    expect((await validateQuery({ q: 'vpn', limit: 26 })).errors).not.toHaveLength(0);
  });

  it('accepts the types list as csv and refuses unknown types', async () => {
    const csv = await validateQuery({ q: 'vpn', types: 'ticket,user' });
    expect(csv.errors).toHaveLength(0);
    expect(csv.dto.types).toEqual(['ticket', 'user']);

    const repeated = await validateQuery({ q: 'vpn', types: ['article', 'user'] });
    expect(repeated.dto.types).toEqual(['article', 'user']);

    expect(
      (await validateQuery({ q: 'vpn', types: 'ticket,audit' })).errors,
    ).not.toHaveLength(0);
  });

  it('defaults to all three groups and to fifteen hits', () => {
    expect(toSearchQuery(plainToInstance(SearchQueryDto, { q: ' vpn ' }))).toEqual({
      q: 'vpn',
      types: ['ticket', 'article', 'user'],
      limit: searchConstants.defaultLimit,
    });
    expect(
      toSearchQuery(plainToInstance(SearchQueryDto, { q: 'vpn', limit: 25 })),
    ).toMatchObject({ limit: 25 });
  });
});

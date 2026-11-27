import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { permissionCatalogEntries } from '../../authorization/permission-catalog';
import { createGlobalValidationPipe } from '../../../common/validation/create-global-validation-pipe';
import {
  permissionKeyMaxLength,
  permissionKeysMaxCount,
  previewTokenMaxLength,
  PreviewRolePermissionsDto,
  ReplaceRolePermissionsDto,
} from './replace-role-permissions.dto';

/*
  W2.34 (`BA-rbac-07`): the DTO accepted any array, any key and any token and let
  the service do the expensive part first. These tests run the **global pipe the
  application actually installs** (`createGlobalValidationPipe`) over the DTO, so
  what they prove is the request-level answer the client sees: a controlled 400,
  not a service call that figures out the same thing later.

  The last block pins the limits to the catalog: if someone adds permissions, the
  array bound follows automatically; if someone adds a very long key, the guard
  fails here instead of letting the DTO truncate a legitimate value.
*/
function body<T>(metatype: new () => T, value: unknown): Promise<unknown> {
  return createGlobalValidationPipe().transform(value, {
    type: 'body',
    metatype,
    data: '',
  });
}

const validToken = 'a'.repeat(64);

function replacePayload(overrides: Record<string, unknown> = {}) {
  return {
    permissionKeys: ['ticket.merge'],
    previewToken: validToken,
    reason: 'IT: provjera limita',
    ...overrides,
  };
}

describe('role permission DTO limits (BA-rbac-07)', () => {
  it('accepts a payload inside every limit', async () => {
    await expect(
      body(ReplaceRolePermissionsDto, replacePayload()),
    ).resolves.toMatchObject({ reason: 'IT: provjera limita' });
  });

  it('rejects a permission array larger than the catalog with a 400', async () => {
    const oversized = Array.from(
      { length: permissionKeysMaxCount + 1 },
      () => 'ticket.merge',
    );
    await expect(
      body(
        ReplaceRolePermissionsDto,
        replacePayload({ permissionKeys: oversized }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts the catalog-sized array itself', async () => {
    const atLimit = permissionCatalogEntries.map((entry) => entry.key);
    expect(atLimit.length).toBeLessThanOrEqual(permissionKeysMaxCount);
    await expect(
      body(ReplaceRolePermissionsDto, replacePayload({ permissionKeys: atLimit })),
    ).resolves.toBeDefined();
  });

  it('rejects an over-long permission key with a 400', async () => {
    await expect(
      body(
        ReplaceRolePermissionsDto,
        replacePayload({ permissionKeys: ['a'.repeat(permissionKeyMaxLength + 1)] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      body(
        PreviewRolePermissionsDto,
        { permissionKeys: ['a'.repeat(permissionKeyMaxLength + 1)] },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an over-long preview token with a 400', async () => {
    await expect(
      body(
        ReplaceRolePermissionsDto,
        replacePayload({ previewToken: 'a'.repeat(previewTokenMaxLength + 1) }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a permission item that is not a string before reaching the service', async () => {
    await expect(
      body(
        ReplaceRolePermissionsDto,
        replacePayload({ permissionKeys: ['ticket.merge', 42] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps the limits pinned to the real catalog', () => {
    const longestKey = Math.max(
      ...permissionCatalogEntries.map((entry) => entry.key.length),
    );
    expect(longestKey).toBeLessThanOrEqual(permissionKeyMaxLength);
    // The array bound is the catalog size by construction; the assertion stays so
    // a future refactor cannot silently detach it from the catalog.
    expect(permissionKeysMaxCount).toBe(permissionCatalogEntries.length);
    // Worst-case token (both sides of the diff at the key ceiling) must fit.
    const worstCaseTokenBytes = 2 * permissionKeysMaxCount * (permissionKeyMaxLength + 3);
    expect(previewTokenMaxLength).toBeGreaterThan(worstCaseTokenBytes * 1.34 + 128);
  });

  it('keeps the DTO instance shape used by the controller', () => {
    const instance = plainToInstance(
      PreviewRolePermissionsDto,
      { permissionKeys: ['ticket.merge'] },
      { excludeExtraneousValues: false },
    );
    expect(instance.permissionKeys).toEqual(['ticket.merge']);
  });
});

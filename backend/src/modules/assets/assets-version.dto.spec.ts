import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssetError, assetErrorCodes } from './assets.constants';
import {
  AssetStatusDto,
  AssignAssetDto,
  SaveAssetDto,
  UnassignAssetDto,
  UpdateAssetDto,
} from './assets.dto';
import { mapAssetError } from './map-asset-error';

const requiredAssetFields = {
  typeId: 'type-1',
  name: 'Oprema',
  organizationalUnitId: 'unit-1',
};

async function properties(type: new () => object, value: object): Promise<string[]> {
  return (await validate(plainToInstance(type, value))).map((error) => error.property).sort();
}

describe('asset optimistic version request contract', () => {
  it('keeps create versionless but requires a positive integer for updates and all direct mutations', async () => {
    await expect(properties(SaveAssetDto, requiredAssetFields)).resolves.toEqual([]);

    const requests = [
      [UpdateAssetDto, requiredAssetFields],
      [AssetStatusDto, { status: 'IN_REPAIR' }],
      [AssignAssetDto, { userId: 'user-1' }],
      [UnassignAssetDto, {}],
    ] as const;
    for (const [type, payload] of requests) {
      await expect(properties(type, payload)).resolves.toContain('version');
    }

    await expect(
      properties(UpdateAssetDto, { ...requiredAssetFields, version: 0 }),
    ).resolves.toContain('version');
    await expect(
      properties(AssetStatusDto, { status: 'IN_REPAIR', version: 1.5 }),
    ).resolves.toContain('version');
  });

  it('maps a failed asset CAS to HTTP 409 Conflict', () => {
    const mapped = mapAssetError(new AssetError(assetErrorCodes.versionConflict));
    expect(mapped).toBeInstanceOf(ConflictException);
    expect((mapped as ConflictException).getStatus()).toBe(409);
  });
});

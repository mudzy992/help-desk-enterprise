import {
  allocateAssetTransferTemplateVersion,
  assetTransferTemplateVersionUniqueIndex,
  isAssetTransferTemplateVersionConflict,
} from './asset-transfer-template-version';

describe('asset transfer template version allocation', () => {
  it('takes the transaction lock before reading latest and returns the next version', async () => {
    const events: string[] = [];
    const transaction = {
      $queryRaw: jest.fn().mockImplementation(async () => {
        events.push('lock');
        return [];
      }),
      assetTransferTemplate: {
        findFirst: jest.fn().mockImplementation(async () => {
          events.push('latest');
          return { version: 8 };
        }),
      },
    };

    await expect(
      allocateAssetTransferTemplateVersion(transaction as never),
    ).resolves.toBe(9);

    expect(events).toEqual(['lock', 'latest']);
    expect(transaction.assetTransferTemplate.findFirst).toHaveBeenCalledWith({
      orderBy: { version: 'desc' },
      select: { version: true },
    });
  });

  it('starts at version one when no user template exists', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      assetTransferTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await expect(
      allocateAssetTransferTemplateVersion(transaction as never),
    ).resolves.toBe(1);
  });

  it('recognizes only the template version unique constraint', () => {
    expect(
      isAssetTransferTemplateVersionConflict({
        code: 'P2002',
        meta: { modelName: 'AssetTransferTemplate', target: ['version'] },
      }),
    ).toBe(true);
    expect(
      isAssetTransferTemplateVersionConflict({
        code: '23505',
        constraint: assetTransferTemplateVersionUniqueIndex,
      }),
    ).toBe(true);
    expect(
      isAssetTransferTemplateVersionConflict({
        code: 'P2002',
        meta: {
          modelName: 'AssetTransferTemplate',
          target: assetTransferTemplateVersionUniqueIndex,
        },
      }),
    ).toBe(true);

    expect(
      isAssetTransferTemplateVersionConflict({
        code: 'P2002',
        meta: { target: ['sha256'] },
      }),
    ).toBe(false);
    expect(
      isAssetTransferTemplateVersionConflict({
        code: 'P2002',
        meta: { modelName: 'AssetTransfer', target: ['version'] },
      }),
    ).toBe(false);
    expect(
      isAssetTransferTemplateVersionConflict({
        code: 'P2002',
        meta: { target: ['version'] },
      }),
    ).toBe(false);
    expect(
      isAssetTransferTemplateVersionConflict({
        code: 'P2003',
        meta: { target: ['version'] },
      }),
    ).toBe(false);
  });
});

import { Test } from '@nestjs/testing';
import { DirectorySyncError } from './directory-sync.error';
import { DirectorySyncProviderResolver } from './directory-sync-provider.resolver';
import { ManualOnlyDirectorySyncProvider } from './manual-only-directory-sync.provider';

describe('DirectorySyncProviderResolver', () => {
  it('registers and returns the manual_only provider from the Nest module', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ManualOnlyDirectorySyncProvider,
        DirectorySyncProviderResolver,
      ],
    }).compile();
    const resolver = moduleRef.get(DirectorySyncProviderResolver);
    const provider = moduleRef.get(ManualOnlyDirectorySyncProvider);
    expect(resolver.resolve('manual_only')).toBe(provider);
    expect(provider.strategy).toBe('manual_only');
  });

  it('fails closed for scheduled until that provider exists', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ManualOnlyDirectorySyncProvider,
        DirectorySyncProviderResolver,
      ],
    }).compile();
    const resolver = moduleRef.get(DirectorySyncProviderResolver);
    expect(() => resolver.resolve('scheduled')).toThrow(
      new DirectorySyncError('DIRECTORY_SYNC_UNAVAILABLE'),
    );
  });
});

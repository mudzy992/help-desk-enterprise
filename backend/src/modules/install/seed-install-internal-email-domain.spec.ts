import { seedInstallInternalEmailDomain } from './seed-install-internal-email-domain';
import type { InstallSettingsWriteTransaction } from './install-complete.types';

const key = 'private.notifications.email.internalDomainsCsv';

function store(initial: Record<string, unknown> = {}) {
  const values = new Map<string, unknown>(Object.entries(initial));
  const fake = {
    appSetting: {
      findUnique: async ({ where }: { where: { key: string } }) => (values.has(where.key) ? { value: values.get(where.key) } : null),
      upsert: async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => {
        values.set(where.key, create.value);
        return {};
      },
    },
  } as unknown as InstallSettingsWriteTransaction;
  return { fake, values };
}

describe('seedInstallInternalEmailDomain', () => {
  it("stores the super admin's domain, lower-cased", async () => {
    const { fake, values } = store();
    await seedInstallInternalEmailDomain(fake, 'Admin@Klijent.BA');
    expect(values.get(key)).toBe('klijent.ba');
  });

  it('never overwrites a configured value', async () => {
    const { fake, values } = store({ [key]: 'epbih.ba' });
    await seedInstallInternalEmailDomain(fake, 'admin@drugi.ba');
    expect(values.get(key)).toBe('epbih.ba');
  });

  it('fills an empty value and ignores malformed addresses', async () => {
    const empty = store({ [key]: '' });
    await seedInstallInternalEmailDomain(empty.fake, 'admin@firma.com');
    expect(empty.values.get(key)).toBe('firma.com');
    const bad = store();
    await seedInstallInternalEmailDomain(bad.fake, 'admin@localhost');
    expect(bad.values.has(key)).toBe(false);
  });

  it('does not throw when the store fails', async () => {
    const failing = { appSetting: { findUnique: async () => { throw new Error('db down'); }, upsert: async () => ({}) } } as unknown as InstallSettingsWriteTransaction;
    await expect(seedInstallInternalEmailDomain(failing, 'a@b.ba')).resolves.toBeUndefined();
  });
});

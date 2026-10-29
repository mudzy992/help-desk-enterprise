import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { DiskStagedStorageAdapter } from './disk-staged-storage.adapter';
import { StorageWriteService } from './storage-write.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('storage stage/intent/promote protocol', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let service: StorageWriteService;
  let root: string;
  const namespace = `it.storage.${Date.now()}`;

  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    service = new StorageWriteService(prisma as never);
    root = mkdtempSync(join(tmpdir(), 'storage-write-'));
  });
  afterAll(async () => {
    await prisma.storageWriteIntent.deleteMany({ where: { namespace } });
    await prisma.$disconnect();
    rmSync(root, { recursive: true, force: true });
  });

  it('promotes only after the intent transaction commits', async () => {
    const adapter = new DiskStagedStorageAdapter(root);
    const result = await service.write({
      namespace, key: 'successful-write-0001', finalKey: 'objects/success.bin', contents: Buffer.from('durable'), adapter,
      commit: async (_transaction, intent) => intent.id,
    });
    expect(result).toMatchObject({ status: 'READY', replayed: false });
    expect(existsSync(join(root, 'objects/success.bin'))).toBe(true);
    expect(await prisma.storageWriteIntent.findUniqueOrThrow({ where: { id: result.id } })).toMatchObject({ status: 'READY' });
  });

  it('removes the staged blob and persists neither intent nor business effect after rollback', async () => {
    const adapter = new DiskStagedStorageAdapter(root);
    await expect(service.write({
      namespace, key: 'rollback-write-00001', finalKey: 'objects/rollback.bin', contents: Buffer.from('rollback'), adapter,
      commit: async () => { throw new Error('business rollback'); },
    })).rejects.toThrow('business rollback');
    expect(await prisma.storageWriteIntent.count({ where: { namespace, key: 'rollback-write-00001' } })).toBe(0);
    expect(existsSync(join(root, 'objects/rollback.bin'))).toBe(false);
    expect(existsSync(join(root, '.staging')) ? readdirSync(join(root, '.staging')).length : 0).toBe(0);
  });

  it('persists pending intent on promote failure and converges through reconciliation', async () => {
    const disk = new DiskStagedStorageAdapter(root);
    let fail = true;
    const adapter = {
      stage: disk.stage.bind(disk), remove: disk.remove.bind(disk),
      promote: async (staging: string, final: string) => {
        if (fail) { fail = false; throw new Error('simulated storage outage'); }
        await disk.promote(staging, final);
      },
    };
    const result = await service.write({
      namespace, key: 'reconcile-write-0001', finalKey: 'objects/reconciled.bin', contents: Buffer.from('recover'), adapter,
      commit: async () => 'committed',
    });
    expect(result).toMatchObject({ status: 'PENDING_PROMOTION', value: 'committed' });
    await expect(service.reconcileOne(namespace, adapter)).resolves.toBe('ready');
    expect(existsSync(join(root, 'objects/reconciled.bin'))).toBe(true);
    expect(await prisma.storageWriteIntent.findUniqueOrThrow({ where: { id: result.id } })).toMatchObject({ status: 'READY', attempts: 1 });
  });
});

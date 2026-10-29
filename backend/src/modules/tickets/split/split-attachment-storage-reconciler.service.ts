import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { DiskStagedStorageAdapter } from '../../../common/storage-write/disk-staged-storage.adapter';
import { StorageWriteService } from '../../../common/storage-write/storage-write.service';
import { resolveUploadRoot } from '../attachments/resolve-upload-root';

export const splitAttachmentStorageNamespace = 'ticket.split.attachment';
const reconcileIntervalMs = 5_000;

@Injectable()
export class SplitAttachmentStorageReconciler implements OnModuleInit, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;
  private readonly adapter = new DiskStagedStorageAdapter(resolveUploadRoot());

  constructor(private readonly storageWrites: StorageWriteService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.drain().catch(() => undefined); }, reconcileIntervalMs);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  async drain(): Promise<void> {
    for (let index = 0; index < 25; index += 1) {
      const result = await this.storageWrites.reconcileOne(splitAttachmentStorageNamespace, this.adapter);
      if (result === 'idle') return;
    }
  }
}

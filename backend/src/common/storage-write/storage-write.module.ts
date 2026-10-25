import { Global, Module } from '@nestjs/common';
import { StorageWriteService } from './storage-write.service';

@Global()
@Module({ providers: [StorageWriteService], exports: [StorageWriteService] })
export class StorageWriteModule {}

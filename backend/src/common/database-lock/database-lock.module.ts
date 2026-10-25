import { Global, Module } from '@nestjs/common';
import { DatabaseLockService } from './database-lock.service';

@Global()
@Module({ providers: [DatabaseLockService], exports: [DatabaseLockService] })
export class DatabaseLockModule {}

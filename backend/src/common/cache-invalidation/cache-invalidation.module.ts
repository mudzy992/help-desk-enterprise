import { Global, Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { CacheInvalidationService } from './cache-invalidation.service';

@Global()
@Module({ imports: [OutboxModule], providers: [CacheInvalidationService], exports: [CacheInvalidationService] })
export class CacheInvalidationModule {}

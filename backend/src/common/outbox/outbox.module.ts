import { Global, Module } from '@nestjs/common';
import { TransactionalOutboxService } from './transactional-outbox.service';

@Global()
@Module({ providers: [TransactionalOutboxService], exports: [TransactionalOutboxService] })
export class OutboxModule {}

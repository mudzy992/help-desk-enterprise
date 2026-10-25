import { Global, Module } from '@nestjs/common';
import { RequestIdempotencyService } from './request-idempotency.service';

@Global()
@Module({
  providers: [RequestIdempotencyService],
  exports: [RequestIdempotencyService],
})
export class IdempotencyModule {}

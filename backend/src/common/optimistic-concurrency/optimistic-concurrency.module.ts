import { Global, Module } from '@nestjs/common';
import { OptimisticConcurrencyService } from './optimistic-concurrency.service';

@Global()
@Module({ providers: [OptimisticConcurrencyService], exports: [OptimisticConcurrencyService] })
export class OptimisticConcurrencyModule {}

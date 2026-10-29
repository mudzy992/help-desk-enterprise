import { Global, Module } from '@nestjs/common';
import { BulkCommandService } from './bulk-command.service';

@Global()
@Module({ providers: [BulkCommandService], exports: [BulkCommandService] })
export class BulkCommandModule {}

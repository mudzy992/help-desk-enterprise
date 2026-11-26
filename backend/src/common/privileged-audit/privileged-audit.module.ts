import { Global, Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { PrivilegedAuditService } from './privileged-audit.service';

/**
 * W2.24 (`BA-security-03`): global so every privileged path (authentication,
 * security settings, users) can reach the durable audit writer without importing
 * a feature module — `AuditLogModule` already imports `AuthenticationModule`, so
 * the other direction would be a cycle.
 */
@Global()
@Module({
  imports: [OutboxModule],
  providers: [PrivilegedAuditService],
  exports: [PrivilegedAuditService],
})
export class PrivilegedAuditModule {}

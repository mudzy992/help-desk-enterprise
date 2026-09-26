import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { IntegrationQueueWorkerModule } from './modules/integration-queue/integration-queue-worker.module';
import { KnowledgeBaseReviewReminderWorkerModule } from './modules/knowledge-base/knowledge-base-review-reminder-worker.module';
import { NotificationRetentionWorkerModule } from './modules/notifications/notification-retention-worker.module';
import { NotificationDigestWorkerModule } from './modules/notifications/preferences/notification-digest-worker.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SlaScanWorkerModule } from './modules/sla/sla-scan-worker.module';
import { TicketArchiveWorkerModule } from './modules/tickets/archive/ticket-archive-worker.module';
import { TimeTrackingSweepWorkerModule } from './modules/tickets/time-tracking/time-tracking-sweep-worker.module';
import { UnroutedSweepWorkerModule } from './modules/tickets/unrouted/unrouted-sweep-worker.module';
import { DirectorySyncWorkerModule } from './modules/directory-sync/ldaps/directory-sync-worker.module';
import { WaitingForUserWorkerModule } from './modules/tickets/waiting-for-user/waiting-for-user-worker.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    RedisModule,
    SettingsModule,
    IntegrationQueueWorkerModule,
    SlaScanWorkerModule,
    NotificationRetentionWorkerModule,
    NotificationDigestWorkerModule,
    // Phase 4.1: the periodic business sweeps now live here and nowhere else.
    TicketArchiveWorkerModule,
    WaitingForUserWorkerModule,
    UnroutedSweepWorkerModule,
    TimeTrackingSweepWorkerModule,
    KnowledgeBaseReviewReminderWorkerModule,
    DirectorySyncWorkerModule,
  ],
})
export class WorkerModule {}

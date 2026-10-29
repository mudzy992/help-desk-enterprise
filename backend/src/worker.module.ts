import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { WorkerScheduleReconcilerService } from './worker-schedule-reconciler.service';
import { validateRuntimeEnvironment } from './common/config/validate-runtime-environment';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { InboundEmailWorkerModule } from './modules/inbound-email/inbound-email-worker.module';
import { IntegrationQueueWorkerModule } from './modules/integration-queue/integration-queue-worker.module';
import { KnowledgeBaseReviewReminderWorkerModule } from './modules/knowledge-base/knowledge-base-review-reminder-worker.module';
import { NotificationRetentionWorkerModule } from './modules/notifications/notification-retention-worker.module';
import { NotificationDigestWorkerModule } from './modules/notifications/preferences/notification-digest-worker.module';
import { OnCallWorkerModule } from './modules/on-call/on-call-worker.module';
import { AssetRemindersWorkerModule } from './modules/assets/reminders/asset-reminders-worker.module';
import { ProblemSweepWorkerModule } from './modules/problems/sweep/problem-sweep-worker.module';
import { ChangeSweepWorkerModule } from './modules/changes/sweep/change-sweep-worker.module';
import { AssetDirectorySyncWorkerModule } from './modules/assets/directory/asset-directory-sync-worker.module';
import { AnnouncementWorkerModule } from './modules/announcements/announcement-worker.module';
import { PrivacyWorkerModule } from './modules/privacy/privacy-worker.module';
import { OpsHealthWorkerModule } from './modules/ops-health/ops-health-worker.module';
import { SecurityAuditWebhookWorkerModule } from './modules/security-audit-webhook/security-audit-webhook-worker.module';
import { ReportSchedulesWorkerModule } from './modules/reports/schedules/report-schedules-worker.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SlaScanWorkerModule } from './modules/sla/sla-scan-worker.module';
import { TicketArchiveWorkerModule } from './modules/tickets/archive/ticket-archive-worker.module';
import { TimeTrackingSweepWorkerModule } from './modules/tickets/time-tracking/time-tracking-sweep-worker.module';
import { UnroutedSweepWorkerModule } from './modules/tickets/unrouted/unrouted-sweep-worker.module';
import { DirectorySyncWorkerModule } from './modules/directory-sync/ldaps/directory-sync-worker.module';
import { WaitingForUserWorkerModule } from './modules/tickets/waiting-for-user/waiting-for-user-worker.module';
import { StatusPageWorkerModule } from './modules/status-page/status-page-worker.module';

@Module({
  imports: [
    DiscoveryModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: validateRuntimeEnvironment,
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
    // Paket 2.3: reply by e-mail.
    InboundEmailWorkerModule,
    // Paket 2.5: scheduled e-mail reports.
    ReportSchedulesWorkerModule,
    PrivacyWorkerModule,
    // Paket 2.9 (K3): on-call reminders and uncovered shifts.
    OnCallWorkerModule,
    // Paket 2.9 (K2): announcement notifications and receipt retention.
    AnnouncementWorkerModule,
    OpsHealthWorkerModule,
    // Paket 5.4.2 (stavka 3): signed webhook export of the auth and security audit rows.
    SecurityAuditWebhookWorkerModule,
    AssetRemindersWorkerModule,
    AssetDirectorySyncWorkerModule,
    ProblemSweepWorkerModule,
    ChangeSweepWorkerModule,
    StatusPageWorkerModule,
  ],
  providers: [WorkerScheduleReconcilerService],
})
export class WorkerModule {}

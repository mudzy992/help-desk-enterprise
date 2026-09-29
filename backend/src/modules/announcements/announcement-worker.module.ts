import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsModule } from '../settings/settings.module';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementSweepProcessor } from './announcement-sweep.processor';
import { AnnouncementSweepSchedulerService } from './announcement-sweep.scheduler.service';
import { announcementSweepQueueName } from './announcement-sweep.job.constants';

/** Paket 2.9 (K2): the announcement sweep, worker-only. */
@Module({
  imports: [BullModule.registerQueue({ name: announcementSweepQueueName }), SettingsModule],
  providers: [AnnouncementsService, AnnouncementSweepProcessor, AnnouncementSweepSchedulerService],
})
export class AnnouncementWorkerModule {}

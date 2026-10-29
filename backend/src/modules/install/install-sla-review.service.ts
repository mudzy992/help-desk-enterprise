import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { patchPriorityMatrix } from '../sla/patch-priority-matrix';
import { settingKeys } from '../settings/setting-keys';
import { SETTINGS_REGISTRY } from '../settings/settings.registry-token';
import { SettingsService } from '../settings/settings.service';
import type { SettingsRegistry } from '../settings/settings.types';
import { updateBusinessHoursCalendar } from '../sla/update-business-hours-calendar';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { installSlaReviewConstants, installSlaReviewErrorCodes } from './install-sla-review.constants';
import { InstallSlaReviewError } from './install-sla-review.error';
import {
  findStartingCalendar,
  readInstallSlaReviewStatus,
} from './read-install-sla-review-status';
import type {
  InstallSlaReviewInput,
  InstallSlaReviewResult,
  InstallSlaReviewStatus,
} from './install-sla-review.types';
import { mapInstallSlaReviewError } from './map-install-sla-review-error';
import { persistInstallMarker } from './persist-install-marker';

/**
 * F4.4: the SLA review step. „Potvrđujem podrazumijevano“ only records that the
 * operator looked (marker `confirmed`); an actual change goes through the SLA
 * domain functions the SLA screens use — working hours through
 * `updateBusinessHoursCalendar`, the matrix through `patchPriorityMatrix` — so the
 * change log, the validation and the audit trail are the same. Holidays are read
 * only here (owner note: „praznici (opcionalno)“); a deployment that needs them
 * edits the calendar after the wizard, on the SLA screen.
 */
@Injectable()
export class InstallSlaReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(SETTINGS_REGISTRY) private readonly registry: SettingsRegistry,
  ) {}

  getStatus(): Promise<InstallSlaReviewStatus> {
    return this.execute(() =>
      readInstallSlaReviewStatus(this.prisma, this.settingsService),
    );
  }

  async save(input: InstallSlaReviewInput): Promise<InstallSlaReviewResult> {
    return this.execute(async () => {
      const superAdmin = await findInstallSuperAdmin(this.prisma);
      if (superAdmin === null) {
        throw new InstallSlaReviewError(
          installSlaReviewErrorCodes.superAdminRequired,
        );
      }
      const hasCalendarChange = hasOwnChange(input.calendar);
      const hasMatrixChange = (input.cells?.length ?? 0) > 0;
      if (input.outcome === 'adjusted' && !hasCalendarChange && !hasMatrixChange) {
        throw new InstallSlaReviewError(
          installSlaReviewErrorCodes.emptyAdjustment,
        );
      }
      const context = { actorUserId: superAdmin.id };
      if (hasCalendarChange) {
        const calendar = await findStartingCalendar(this.prisma);
        if (calendar === null) {
          throw new InstallSlaReviewError(
            installSlaReviewErrorCodes.calendarMissing,
          );
        }
        await updateBusinessHoursCalendar(
          this.prisma,
          calendar.id,
          {
            ...input.calendar,
            reason: installSlaReviewConstants.changeLogReason,
          },
          context,
        );
      }
      if (hasMatrixChange) {
        await patchPriorityMatrix(
          this.prisma,
          { cells: [...(input.cells ?? [])], reason: installSlaReviewConstants.changeLogReason },
          context,
        );
      }
      await persistInstallMarker(this.prisma, this.registry, {
        key: settingKeys.privateInstallSlaReview,
        value: input.outcome,
        actorUserId: superAdmin.id,
        reason: installSlaReviewConstants.changeLogReason,
      });
      return {
        ...(await readInstallSlaReviewStatus(this.prisma, this.settingsService)),
        calendarUpdated: hasCalendarChange,
        matrixUpdated: hasMatrixChange,
      };
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallSlaReviewError(error);
    }
  }
}

function hasOwnChange(
  input: InstallSlaReviewInput['calendar'],
): input is NonNullable<InstallSlaReviewInput['calendar']> {
  if (input === undefined) {
    return false;
  }
  return Object.values(input).some((value) => value !== undefined);
}

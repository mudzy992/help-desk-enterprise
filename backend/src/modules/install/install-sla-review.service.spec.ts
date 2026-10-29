import { HttpException } from '@nestjs/common';
import { listBusinessHoursCalendars } from '../sla/list-business-hours-calendars';
import { listPriorityMatrix } from '../sla/list-priority-matrix';
import { patchPriorityMatrix } from '../sla/patch-priority-matrix';
import { updateBusinessHoursCalendar } from '../sla/update-business-hours-calendar';
import { settingKeys } from '../settings/setting-keys';
import { createInstallWizardHarness } from './create-install-wizard-harness';
import { InstallSlaReviewService } from './install-sla-review.service';

/**
 * F4.4: „Potvrđujem podrazumijevano“ only records that the operator looked, an
 * actual change goes through the SLA domain functions (their own specs cover the
 * validation), and „adjusted“ without a change is refused instead of silently
 * marking the step as reviewed.
 */
jest.mock('../sla/list-business-hours-calendars', () => ({
  listBusinessHoursCalendars: jest.fn(),
}));
jest.mock('../sla/list-priority-matrix', () => ({
  listPriorityMatrix: jest.fn(),
}));
jest.mock('../sla/update-business-hours-calendar', () => ({
  updateBusinessHoursCalendar: jest.fn(),
}));
jest.mock('../sla/patch-priority-matrix', () => ({
  patchPriorityMatrix: jest.fn(),
}));

const calendarsMock = listBusinessHoursCalendars as jest.MockedFunction<
  typeof listBusinessHoursCalendars
>;
const matrixMock = listPriorityMatrix as jest.MockedFunction<typeof listPriorityMatrix>;
const updateCalendarMock = updateBusinessHoursCalendar as jest.MockedFunction<
  typeof updateBusinessHoursCalendar
>;
const patchMatrixMock = patchPriorityMatrix as jest.MockedFunction<
  typeof patchPriorityMatrix
>;

const standardCalendar = {
  id: 'calendar-1',
  key: 'BH_STANDARD',
  name: 'Standardno radno vrijeme',
  timezone: 'Europe/Sarajevo',
  weeklyHours: { '1': [{ start: '08:00', end: '16:00' }] },
  isActive: true,
  holidays: [],
  createdAt: new Date('2026-09-11T08:00:00.000Z'),
  updatedAt: new Date('2026-09-11T08:00:00.000Z'),
};

const matrix = {
  cells: [
    { id: null, impact: 'HIGH', urgency: 'HIGH', priority: 'CRITICAL' },
  ],
};

async function createService(withSuperAdmin = true) {
  const harness = await createInstallWizardHarness({ withSuperAdmin });
  return {
    harness,
    service: new InstallSlaReviewService(
      harness.prisma,
      harness.settingsService,
      harness.registry,
    ),
  };
}

function errorCode(error: unknown): string {
  if (!(error instanceof HttpException)) {
    throw new Error(`Expected an HttpException, got ${String(error)}`);
  }
  return (error.getResponse() as { code?: string }).code ?? '';
}

beforeEach(() => {
  calendarsMock.mockReset();
  matrixMock.mockReset();
  updateCalendarMock.mockReset();
  patchMatrixMock.mockReset();
  calendarsMock.mockResolvedValue({ items: [standardCalendar], total: 1, hasMore: false, nextCursor: null });
  matrixMock.mockResolvedValue(matrix as never);
  updateCalendarMock.mockResolvedValue(standardCalendar);
  patchMatrixMock.mockResolvedValue(matrix as never);
});

describe('InstallSlaReviewService', () => {
  it('shows the seeded calendar and matrix while nothing is confirmed', async () => {
    const { service } = await createService();

    const status = await service.getStatus();

    expect(status.review).toBeNull();
    expect(status.calendar).toMatchObject({
      key: 'BH_STANDARD',
      timezone: 'Europe/Sarajevo',
      name: 'Standardno radno vrijeme',
    });
    expect(status.matrix).toEqual(matrix);
  });

  it('records the confirmation without touching the working hours', async () => {
    const { service, harness } = await createService();

    const result = await service.save({ outcome: 'confirmed' });

    expect(result).toMatchObject({
      review: 'confirmed',
      calendarUpdated: false,
      matrixUpdated: false,
    });
    expect(updateCalendarMock).not.toHaveBeenCalled();
    expect(patchMatrixMock).not.toHaveBeenCalled();
    await expect(
      harness.settingsService.getSetting(settingKeys.privateInstallSlaReview),
    ).resolves.toBe('confirmed');
  });

  it('writes an adjusted review through the SLA domain functions', async () => {
    const { service, harness } = await createService();

    const result = await service.save({
      outcome: 'adjusted',
      calendar: { weeklyHours: { '1': [{ start: '07:30', end: '15:30' }] } },
      cells: [{ impact: 'HIGH', urgency: 'HIGH', priority: 'HIGH' }],
    });

    expect(result).toMatchObject({
      review: 'adjusted',
      calendarUpdated: true,
      matrixUpdated: true,
    });
    expect(updateCalendarMock).toHaveBeenCalledWith(
      harness.prisma,
      'calendar-1',
      expect.objectContaining({ reason: 'install_wizard' }),
      { actorUserId: harness.actorUserId },
    );
    expect(patchMatrixMock).toHaveBeenCalledWith(
      harness.prisma,
      expect.objectContaining({
        reason: 'install_wizard',
        cells: [{ impact: 'HIGH', urgency: 'HIGH', priority: 'HIGH' }],
      }),
      { actorUserId: harness.actorUserId },
    );
  });

  it('refuses an adjusted review that changes nothing', async () => {
    const { service } = await createService();

    const error = await service
      .save({ outcome: 'adjusted' })
      .catch((thrown: unknown) => thrown);

    expect(errorCode(error)).toBe('SLA_REVIEW_EMPTY_ADJUSTMENT');
    expect(updateCalendarMock).not.toHaveBeenCalled();
  });

  it('needs the founder account before it records anything', async () => {
    const { service } = await createService(false);

    const error = await service
      .save({ outcome: 'confirmed' })
      .catch((thrown: unknown) => thrown);

    expect(errorCode(error)).toBe('SUPER_ADMIN_REQUIRED');
  });

  it('says so when the deployment seeded no calendar to change', async () => {
    const { service } = await createService();
    calendarsMock.mockResolvedValue({ items: [], total: 0, hasMore: false, nextCursor: null });

    const error = await service
      .save({ outcome: 'adjusted', calendar: { isActive: false } })
      .catch((thrown: unknown) => thrown);

    expect(errorCode(error)).toBe('SLA_REVIEW_CALENDAR_MISSING');
  });
});

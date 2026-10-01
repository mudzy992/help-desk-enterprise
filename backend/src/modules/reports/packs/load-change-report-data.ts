import type { PrismaService } from '../../../common/prisma/prisma.service';
import { formatChangeNumber } from '../../changes/change-rules';
import { changeDefaults } from '../../settings/definitions/change-settings';
import { settingKeys } from '../../settings/setting-keys';
import { reportPackLimits } from '../reports.constants';
import type { ReportWindow } from '../reports.types';
import { emptyChangeReportData, type ChangeReportData } from './build-change-reports';

export type ChangeReportPart = 'outcomes' | 'schedule';

async function readNumberPrefix(prisma: PrismaService): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: settingKeys.privateChangesNumberPrefix }, select: { value: true } });
  return typeof row?.value === 'string' ? row.value : changeDefaults.numberPrefix;
}

/** Loads only the part the requested pack needs; changes are scoped by their unit. */
export async function loadChangeReportData(
  prisma: PrismaService,
  input: { readonly unitIds: readonly string[]; readonly part: ChangeReportPart; readonly window: ReportWindow },
): Promise<ChangeReportData> {
  if (input.unitIds.length === 0) return emptyChangeReportData;
  const inUnits = { organizationalUnitId: { in: [...input.unitIds] } };

  if (input.part === 'outcomes') {
    const outcomes = await prisma.changeRequest.findMany({
      where: { ...inUnits, status: 'CLOSED', closedAt: { gte: input.window.from, lt: input.window.to } },
      select: { type: true, outcome: true },
    });
    return { ...emptyChangeReportData, outcomes };
  }

  const [prefix, rows] = await Promise.all([
    readNumberPrefix(prisma),
    prisma.changeRequest.findMany({
      where: { ...inUnits, plannedStart: { lt: input.window.to }, plannedEnd: { gt: input.window.from } },
      orderBy: [{ plannedStart: 'asc' }, { sequence: 'asc' }],
      take: reportPackLimits.exportRows,
      select: {
        sequence: true,
        title: true,
        type: true,
        risk: true,
        status: true,
        plannedStart: true,
        plannedEnd: true,
        outcome: true,
        cabGroup: { select: { name: true } },
      },
    }),
  ]);
  return {
    ...emptyChangeReportData,
    schedule: rows.map((row) => ({
      number: formatChangeNumber(prefix, row.sequence),
      title: row.title,
      type: row.type,
      risk: row.risk,
      status: row.status,
      plannedStart: row.plannedStart,
      plannedEnd: row.plannedEnd,
      outcome: row.outcome,
      cabGroupName: row.cabGroup?.name ?? null,
    })),
  };
}

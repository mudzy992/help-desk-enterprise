import type { ReportScheduleFrequency, ReportScheduleSection } from './report-schedule.constants';

/** The columns every schedule read uses (API list, worker, test send). */
export const reportScheduleSelect = {
  id: true,
  name: true,
  frequency: true,
  sendTime: true,
  organizationalUnitId: true,
  serviceId: true,
  groupId: true,
  priority: true,
  sections: true,
  packKeys: true,
  enabled: true,
  nextRunAt: true,
  lastRunAt: true,
  createdByUserId: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, displayName: true } },
  organizationalUnit: { select: { id: true, name: true } },
  service: { select: { id: true, name: true } },
  group: { select: { id: true, name: true } },
  recipients: {
    select: { userId: true, user: { select: { id: true, displayName: true, email: true, isActive: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

export type ReportScheduleRecord = {
  readonly id: string;
  readonly name: string;
  readonly frequency: ReportScheduleFrequency;
  readonly sendTime: string;
  readonly organizationalUnitId: string;
  readonly serviceId: string | null;
  readonly groupId: string | null;
  readonly priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  readonly sections: readonly ReportScheduleSection[];
  readonly packKeys: readonly string[];
  readonly enabled: boolean;
  readonly nextRunAt: Date;
  readonly lastRunAt: Date | null;
  readonly createdByUserId: string | null;
  readonly updatedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: { readonly id: string; readonly displayName: string } | null;
  readonly organizationalUnit: { readonly id: string; readonly name: string };
  readonly service: { readonly id: string; readonly name: string } | null;
  readonly group: { readonly id: string; readonly name: string } | null;
  readonly recipients: readonly {
    readonly userId: string;
    readonly user: { readonly id: string; readonly displayName: string; readonly email: string; readonly isActive: boolean };
  }[];
};

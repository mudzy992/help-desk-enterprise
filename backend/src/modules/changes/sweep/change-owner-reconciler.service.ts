import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { changeEventActions } from '../changes.constants';
import {
  changeOwnerProfiles,
  profileEligibility,
} from '../change-owner-eligibility';

const reconcileIntervalMs = 5 * 60_000;
const reconcileBatchSize = 100;
/** Terminal changes keep their owner as history; only live work is reconciled. */
const finalStatuses = ['CLOSED', 'REJECTED', 'CANCELLED'] as const;
const driftReason = 'owner_ineligible';

export type ChangeOwnerDriftResult = {
  readonly scanned: number;
  readonly drifted: number;
  readonly recorded: number;
};

/**
 * W7.66 (`BA-changes-10`): the owner assignment is checked when it is written,
 * but a later revocation, deactivation, anonymization or unit move can take the
 * permission away from an owner who is already stored. The access check reads
 * the live assignment, so such a change simply stops being manageable by its
 * owner — silently. This worker makes that state visible once per assignment:
 * one `owner` event with `reason: owner_ineligible`, so the history explains
 * why the change needs a new owner (claim or reassignment).
 *
 * It never rewrites the owner: clearing the field would leave a scheduling
 * change without an accountable person, and the lifecycle rules require one.
 */
@Injectable()
export class ChangeOwnerReconciler implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ChangeOwnerReconciler.name);
  private timer?: ReturnType<typeof setInterval>;
  private cursor: string | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.reconcile().catch((error: unknown) => {
        this.logger.warn(`change_owner_reconcile_failed reason=${errorText(error)}`);
      });
    }, reconcileIntervalMs);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  /** One keyset page per call; repeated ticks cover the whole live set. */
  async reconcile(): Promise<ChangeOwnerDriftResult> {
    if (this.running) return { scanned: 0, drifted: 0, recorded: 0 };
    this.running = true;
    try {
      const changes = await this.prisma.changeRequest.findMany({
        where: {
          ownerUserId: { not: null },
          status: { notIn: [...finalStatuses] },
          ...(this.cursor === null ? {} : { id: { gt: this.cursor } }),
        },
        select: {
          id: true,
          ownerUserId: true,
          organizationalUnit: { select: { ouPath: true } },
        },
        orderBy: { id: 'asc' },
        take: reconcileBatchSize,
      });
      if (changes.length === 0) {
        this.cursor = null;
        return { scanned: 0, drifted: 0, recorded: 0 };
      }
      this.cursor = changes[changes.length - 1]!.id;
      const profiles = await changeOwnerProfiles(
        this.prisma,
        changes
          .map((change) => change.ownerUserId)
          .filter((ownerId): ownerId is string => ownerId !== null),
      );
      let drifted = 0;
      let recorded = 0;
      for (const change of changes) {
        if (change.ownerUserId === null) continue;
        const eligibility = profileEligibility(
          profiles.get(change.ownerUserId),
          change.organizationalUnit.ouPath,
        );
        if (eligibility.eligible) continue;
        drifted += 1;
        if (await this.recordOnce(change.id, change.ownerUserId, eligibility.reason)) {
          recorded += 1;
        }
      }
      if (drifted > 0) {
        this.logger.warn(
          `change_owner_drift detected=${drifted} recorded=${recorded}`,
        );
      }
      return { scanned: changes.length, drifted, recorded };
    } finally {
      this.running = false;
    }
  }

  /** One event per (change, owner, reason); a claim or reassignment resets it. */
  private async recordOnce(
    changeId: string,
    ownerUserId: string,
    reason: string,
  ): Promise<boolean> {
    const last = await this.prisma.changeEvent.findFirst({
      where: { changeId, action: changeEventActions.owner },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { detail: true },
    });
    const detail = last?.detail;
    if (
      typeof detail === 'object' &&
      detail !== null &&
      !Array.isArray(detail) &&
      (detail as Record<string, unknown>).reason === driftReason &&
      (detail as Record<string, unknown>).ownerUserId === ownerUserId
    ) {
      return false;
    }
    await this.prisma.changeEvent.create({
      data: {
        changeId,
        action: changeEventActions.owner,
        actorUserId: null,
        detail: {
          reason: driftReason,
          eligibility: reason,
          ownerUserId,
        } as never,
      },
    });
    return true;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import {
  auditWebhookEpochCursor,
  buildAuditWebhookBatch,
  cursorOfRow,
  sameCursor,
  type AuditWebhookCursor,
  type AuditWebhookRow,
} from './security-audit-webhook.batch';
import {
  securityAuditWebhookBatchSize,
  securityAuditWebhookGiveUpMilliseconds,
  securityAuditWebhookMaxBatchesPerTick,
  securityAuditWebhookSettleMilliseconds,
} from './security-audit-webhook.constants';
import type { AuditWebhookPoster } from './security-audit-webhook.poster';

export const securityAuditWebhookStoreToken = 'SECURITY_AUDIT_WEBHOOK_STORE';
export const securityAuditWebhookPosterToken = 'SECURITY_AUDIT_WEBHOOK_POSTER';

export type AuditWebhookState = {
  readonly cursor: AuditWebhookCursor | null;
  readonly pendingSince: Date | null;
  readonly sentTotal: number;
  readonly failedTotal: number;
  readonly droppedTotal: number;
  readonly lastSuccessAt: Date | null;
  readonly lastErrorCode: string | null;
};

export interface AuditWebhookStore {
  loadState(): Promise<AuditWebhookState>;
  saveState(state: AuditWebhookState): Promise<void>;
  /** Cursor of the newest exported-kind row that is settled, or null when there is none. */
  newestCursor(settledBefore: Date): Promise<AuditWebhookCursor | null>;
  findBatch(cursor: AuditWebhookCursor, settledBefore: Date, take: number): Promise<AuditWebhookRow[]>;
  countAfter(cursor: AuditWebhookCursor, settledBefore: Date): Promise<number>;
}

export type AuditWebhookConfig = {
  readonly enabled: boolean;
  readonly url: string;
  readonly secret: string;
};

export type AuditWebhookRoundResult =
  | { readonly status: 'disabled' }
  | { readonly status: 'idle' }
  | { readonly status: 'sent'; readonly events: number }
  | {
      readonly status: 'failed';
      readonly code: string;
      readonly dropped: number;
    };

/** Reads the three settings of the export; the secret goes through the internal-use reader. */
@Injectable()
export class SecurityAuditWebhookConfigLoader {
  constructor(private readonly settings: SettingsService) {}

  async load(): Promise<AuditWebhookConfig> {
    const [enabled, url, secret] = await Promise.all([
      this.settings.getSetting(settingKeys.privateSecurityAuditWebhookEnabled),
      this.settings.getSetting(settingKeys.privateSecurityAuditWebhookUrl),
      this.settings.getSecretForInternalUse(settingKeys.privateSecurityAuditWebhookSecret),
    ]);
    return {
      enabled: enabled === true,
      url: typeof url === 'string' ? url : '',
      secret: typeof secret === 'string' ? secret : '',
    };
  }
}

/**
 * Paket 5.4.2 (stavka 3): one tick of the export. Rows are sent in ascending
 * order; the cursor moves only after the endpoint answered 2xx. A failure keeps
 * the cursor and the next tick retries the same batch. When a failure streak
 * has lasted longer than the give-up window, every pending row is dropped
 * (counted in `droppedTotal`) and the cursor jumps to the newest settled row.
 * While the export is off the cursor follows the newest row, so switching it on
 * later never sends the events of the time it was off (no backfill).
 */
@Injectable()
export class SecurityAuditWebhookDelivery {
  private readonly logger = new Logger('SecurityAuditWebhook');

  constructor(
    @Inject(securityAuditWebhookStoreToken)
    private readonly store: AuditWebhookStore,
    private readonly configLoader: SecurityAuditWebhookConfigLoader,
    @Inject(securityAuditWebhookPosterToken)
    private readonly post: AuditWebhookPoster,
  ) {}

  async runTick(now: Date = new Date()): Promise<AuditWebhookRoundResult> {
    const config = await this.configLoader.load();
    const settledBefore = new Date(now.getTime() - securityAuditWebhookSettleMilliseconds);
    let state = await this.store.loadState();

    if (!config.enabled || config.url === '' || config.secret === '') {
      const next = (await this.store.newestCursor(settledBefore)) ?? state.cursor ?? auditWebhookEpochCursor;
      if (!sameCursor(next, state.cursor) || state.pendingSince !== null) {
        await this.store.saveState({
          ...state,
          cursor: next,
          pendingSince: null,
        });
      }
      return { status: 'disabled' };
    }

    if (state.cursor === null) {
      state = {
        ...state,
        cursor: (await this.store.newestCursor(settledBefore)) ?? auditWebhookEpochCursor,
      };
    }

    let sentEvents = 0;
    let failure: { code: string; dropped: number } | null = null;
    for (let batchIndex = 0; batchIndex < securityAuditWebhookMaxBatchesPerTick; batchIndex += 1) {
      const cursor = state.cursor ?? auditWebhookEpochCursor;
      const rows = await this.store.findBatch(cursor, settledBefore, securityAuditWebhookBatchSize);
      if (rows.length === 0) {
        if (state.pendingSince !== null) state = { ...state, pendingSince: null };
        break;
      }
      const result = await this.post({
        url: config.url,
        secret: config.secret,
        body: buildAuditWebhookBatch(rows, now),
        now,
      });
      if (result.ok) {
        const last = rows[rows.length - 1];
        sentEvents += rows.length;
        state = {
          ...state,
          cursor: cursorOfRow(last),
          pendingSince: null,
          sentTotal: state.sentTotal + rows.length,
          lastSuccessAt: now,
          lastErrorCode: null,
        };
        if (rows.length < securityAuditWebhookBatchSize) break;
        continue;
      }

      const pendingSince = state.pendingSince ?? now;
      const failedTotal = state.failedTotal + 1;
      if (now.getTime() - pendingSince.getTime() >= securityAuditWebhookGiveUpMilliseconds) {
        const dropped = await this.store.countAfter(cursor, settledBefore);
        const jumpTo = (await this.store.newestCursor(settledBefore)) ?? cursor;
        state = {
          ...state,
          cursor: jumpTo,
          pendingSince: null,
          failedTotal,
          droppedTotal: state.droppedTotal + dropped,
          lastErrorCode: result.code,
        };
        failure = { code: result.code, dropped };
      } else {
        state = {
          ...state,
          pendingSince,
          failedTotal,
          lastErrorCode: result.code,
        };
        failure = { code: result.code, dropped: 0 };
      }
      break;
    }

    await this.store.saveState(state);
    if (failure !== null) {
      this.logger.warn(
        `security_audit_webhook_failed code=${failure.code} dropped=${failure.dropped} pending_since=${state.pendingSince?.toISOString() ?? 'none'}`,
      );
      return { status: 'failed', code: failure.code, dropped: failure.dropped };
    }
    if (sentEvents > 0) {
      this.logger.log(`security_audit_webhook_sent=${sentEvents}`);
      return { status: 'sent', events: sentEvents };
    }
    return { status: 'idle' };
  }
}

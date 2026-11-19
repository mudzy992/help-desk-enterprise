import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { TransactionalOutboxService, type OutboxDelivery } from "../../../common/outbox/transactional-outbox.service";
import { ChangeNotifier } from "../change-notifier";
import { changeReminderDispatchTopic, readChangeReminderPayload } from "./change-reminder-outbox";

const drainIntervalMs = 2_000;
const maxDispatchPerTick = 25;

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

/**
 * BA-changes-07 (W7.48): delivers the reminder intents the sweep persisted.
 * A failed delivery throws, so the outbox owns retry and dead-letter state —
 * the sweep never claims a notice was sent.
 */
@Injectable()
export class ChangeReminderOutboxDispatcher implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ChangeReminderOutboxDispatcher.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;

  constructor(
    private readonly outbox: TransactionalOutboxService,
    private readonly notifier: ChangeNotifier,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.drain().catch((error: unknown) => {
        this.logger.warn(`change_reminder_drain_failed reason=${errorText(error)}`);
      });
    }, drainIntervalMs);
    this.timer.unref?.();
    void this.drain().catch((error: unknown) => {
      this.logger.warn(`change_reminder_drain_failed reason=${errorText(error)}`);
    });
  }

  onApplicationShutdown(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (let index = 0; index < maxDispatchPerTick; index += 1) {
        const result = await this.outbox.dispatchOne(
          changeReminderDispatchTopic,
          (delivery) => this.deliver(delivery),
        );
        if (result === "idle") break;
      }
    } finally {
      this.draining = false;
    }
  }

  private async deliver(delivery: OutboxDelivery): Promise<void> {
    const payload = readChangeReminderPayload(delivery.payload);
    if (payload.kind === "starting_soon") {
      await this.notifier.startingSoon(payload.changeId);
    } else {
      await this.notifier.overdue(payload.changeId);
    }
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { TicketPersistedMessageSink } from "../collaboration.types";
import { publishPersistedTicketMessages } from "../publish-persisted-ticket-messages";
import { TicketRealtimeHub } from "../ticket-realtime.hub";
import type { TicketRecord } from "../tickets.types";
import { daysToMilliseconds } from "../apply-ticket-lifecycle-timestamps";
import { runBoundedTicketAutomation } from "../run-bounded-ticket-automation";
import { processWaitingForUserTicket } from "./process-waiting-for-user-ticket";
import { WaitingForUserConfigurationLoader } from "./waiting-for-user-configuration.loader";
import { TicketGuardrailsConfigurationLoader } from "../guardrails/ticket-guardrails-configuration.loader";
import { TicketSlaTimersService } from "../../sla/ticket-sla-timers.service";

@Injectable()
export class WaitingForUserAutomationService {
  private readonly logger = new Logger(WaitingForUserAutomationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: WaitingForUserConfigurationLoader,
    private readonly guardrailsLoader: TicketGuardrailsConfigurationLoader,
    private readonly slaTimers: TicketSlaTimersService,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  async processDue(now = new Date()): Promise<readonly TicketRecord[]> {
    const configuration = await this.configurationLoader.load();
    const guardrails = await this.guardrailsLoader.load();
    if (!configuration.enabled) {
      return [];
    }
    const reminderCutoff = new Date(
      now.getTime() - daysToMilliseconds(configuration.reminderAfterDays),
    );
    const closeCutoff = new Date(
      now.getTime() - daysToMilliseconds(configuration.autoCloseAfterDays),
    );
    return runBoundedTicketAutomation<TicketRecord, TicketRecord>({
      fetchPage: async (cursor, take) =>
        (await this.prisma.ticket.findMany({
          where: {
            status: "WAITING_FOR_USER",
            OR: [
              { waitingForUserEnteredAt: { lte: closeCutoff } },
              {
                waitingForUserReminderSentAt: null,
                waitingForUserEnteredAt: { lte: reminderCutoff },
              },
            ],
          },
          orderBy: { id: "asc" },
          take,
          ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
        })) as TicketRecord[],
      process: async (ticket) => {
        const messages: TicketPersistedMessageSink = [];
        const next = await processWaitingForUserTicket({
          prisma: this.prisma,
          ticket,
          configuration,
          guardrails,
          now,
          messages,
          slaTimers: this.slaTimers,
        });
        if (
          next.id === ticket.id &&
          next.status === ticket.status &&
          next.waitingForUserReminderSentAt ===
            ticket.waitingForUserReminderSentAt
        )
          return null;
        publishPersistedTicketMessages(this.realtimeHub, next, messages);
        return next;
      },
      onError: (error, ticket) =>
        this.logger.error(
          `Waiting-for-user automation failed for ticket ${ticket.id}`,
          error instanceof Error ? error.stack : String(error),
        ),
    });
  }
}

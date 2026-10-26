import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { daysToMilliseconds } from "../apply-ticket-lifecycle-timestamps";
import type { TicketPersistedMessageSink } from "../collaboration.types";
import { publishPersistedTicketMessages } from "../publish-persisted-ticket-messages";
import { TicketRealtimeHub } from "../ticket-realtime.hub";
import type { TicketRecord } from "../tickets.types";
import { runBoundedTicketAutomation } from "../run-bounded-ticket-automation";
import { TicketGuardrailsConfigurationLoader } from "../guardrails/ticket-guardrails-configuration.loader";
import { processClosedTicketArchive } from "./process-closed-ticket-archive";
import { TicketArchiveConfigurationLoader } from "./ticket-archive-configuration.loader";

@Injectable()
export class TicketArchiveAutomationService {
  private readonly logger = new Logger(TicketArchiveAutomationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: TicketArchiveConfigurationLoader,
    private readonly guardrailsLoader: TicketGuardrailsConfigurationLoader,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  async processDue(now = new Date()): Promise<readonly TicketRecord[]> {
    const configuration = await this.configurationLoader.load();
    const guardrails = await this.guardrailsLoader.load();
    if (!configuration.enabled) {
      return [];
    }
    const cutoff = new Date(
      now.getTime() - daysToMilliseconds(configuration.afterClosedDays),
    );
    return runBoundedTicketAutomation<TicketRecord, TicketRecord>({
      fetchPage: async (cursor, take) =>
        (await this.prisma.ticket.findMany({
          where: { status: "CLOSED", closedAt: { lte: cutoff } },
          orderBy: { id: "asc" },
          take,
          ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
        })) as TicketRecord[],
      process: async (ticket) => {
        const messages: TicketPersistedMessageSink = [];
        const next = await processClosedTicketArchive({
          prisma: this.prisma,
          ticket,
          configuration,
          guardrails,
          now,
          messages,
        });
        if (next.status === ticket.status) return null;
        publishPersistedTicketMessages(this.realtimeHub, next, messages);
        return next;
      },
      onError: (error, ticket) =>
        this.logger.error(
          `Archive automation failed for ticket ${ticket.id}`,
          error instanceof Error ? error.stack : String(error),
        ),
    });
  }
}

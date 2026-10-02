import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { TeamsSimulatorOutbox, TeamsSimulatorRecord } from './simulator-teams-transport';

/** Paket 3.1: simulator transcript in the database (the admin simulator reads it). */
@Injectable()
export class PrismaTeamsSimulatorOutbox implements TeamsSimulatorOutbox {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: TeamsSimulatorRecord): Promise<void> {
    const payload = JSON.parse(JSON.stringify(entry.activity)) as object;
    if (entry.operation === 'update') {
      await this.prisma.teamsSimulatorMessage.updateMany({ where: { activityId: entry.activityId }, data: { payload } });
      return;
    }
    await this.prisma.teamsSimulatorMessage.create({
      data: { conversationId: entry.conversationId, activityId: entry.activityId, direction: 'OUTBOUND', payload },
    });
  }

  async recordInbound(conversationId: string, activityId: string, payload: unknown): Promise<void> {
    await this.prisma.teamsSimulatorMessage.upsert({
      where: { activityId: `in:${activityId}` },
      create: { conversationId, activityId: `in:${activityId}`, direction: 'INBOUND', payload: JSON.parse(JSON.stringify(payload ?? {})) as object },
      update: {},
    });
  }
}

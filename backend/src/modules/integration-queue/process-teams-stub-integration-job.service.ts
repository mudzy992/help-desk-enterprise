import { Injectable, Logger } from '@nestjs/common';
import { parseTeamsStubIntegrationJobPayload } from './parse-teams-stub-integration-job-payload';

@Injectable()
export class ProcessTeamsStubIntegrationJobService {
  private readonly logger = new Logger(
    ProcessTeamsStubIntegrationJobService.name,
  );

  async process(payload: unknown): Promise<void> {
    const teamsPayload = parseTeamsStubIntegrationJobPayload(payload);
    if (teamsPayload === null) {
      throw new Error('Invalid TEAMS_STUB integration job payload');
    }
    this.logger.log(
      `would send to Teams eventType=${teamsPayload.eventType} event=${teamsPayload.event} ticketId=${teamsPayload.ticketId} messageId=${teamsPayload.messageId}`,
    );
  }
}

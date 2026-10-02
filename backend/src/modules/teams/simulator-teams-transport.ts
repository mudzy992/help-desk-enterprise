import { randomUUID } from 'node:crypto';
import type {
  TeamsConversationAddress,
  TeamsCreatePersonalConversationInput,
  TeamsOutboundActivity,
  TeamsSendResult,
  TeamsTransport,
} from './teams-transport';

export const simulatorServiceUrl = 'simulator://teams';

export interface TeamsSimulatorRecord {
  readonly operation: 'send' | 'update';
  readonly conversationId: string;
  readonly activityId: string;
  readonly activity: TeamsOutboundActivity;
}

/** Where simulated activities end up; T2 provides a database-backed outbox. */
export interface TeamsSimulatorOutbox {
  record(entry: TeamsSimulatorRecord): Promise<void>;
}

export class InMemoryTeamsSimulatorOutbox implements TeamsSimulatorOutbox {
  readonly entries: TeamsSimulatorRecord[] = [];
  async record(entry: TeamsSimulatorRecord): Promise<void> {
    this.entries.push(entry);
  }
}

export class SimulatorTeamsTransport implements TeamsTransport {
  readonly mode = 'simulator' as const;

  constructor(
    private readonly outbox: TeamsSimulatorOutbox,
    private readonly newId: () => string = randomUUID,
  ) {}

  async createPersonalConversation(input: TeamsCreatePersonalConversationInput): Promise<TeamsConversationAddress> {
    // Deterministic per user so repeated proactive installs reuse one chat.
    return { serviceUrl: simulatorServiceUrl, conversationId: `sim-personal:${input.userAadObjectId}` };
  }

  async sendActivity(address: TeamsConversationAddress, activity: TeamsOutboundActivity): Promise<TeamsSendResult> {
    const activityId = `sim-activity:${this.newId()}`;
    await this.outbox.record({ operation: 'send', conversationId: address.conversationId, activityId, activity });
    return { activityId };
  }

  async updateActivity(address: TeamsConversationAddress, activityId: string, activity: TeamsOutboundActivity): Promise<void> {
    await this.outbox.record({ operation: 'update', conversationId: address.conversationId, activityId, activity });
  }
}

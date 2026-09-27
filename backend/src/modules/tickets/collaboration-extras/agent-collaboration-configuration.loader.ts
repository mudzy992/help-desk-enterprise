import { Injectable } from '@nestjs/common';
import { agentCollaborationLimits } from '../../settings/definitions/agent-collaboration-settings';
import { settingKeys } from '../../settings/setting-keys';
import { SettingsService } from '../../settings/settings.service';

export type AgentCollaborationConfiguration = {
  readonly presenceEnabled: boolean;
  readonly presenceShowToRequester: boolean;
  readonly collisionWarningEnabled: boolean;
  readonly mentionsEnabled: boolean;
  readonly followersEnabled: boolean;
  readonly followOnReply: boolean;
  readonly linksEnabled: boolean;
  readonly linksMaxPerTicket: number;
};

export const defaultAgentCollaborationConfiguration: AgentCollaborationConfiguration = {
  presenceEnabled: true,
  presenceShowToRequester: true,
  collisionWarningEnabled: true,
  mentionsEnabled: true,
  followersEnabled: true,
  followOnReply: false,
  linksEnabled: true,
  linksMaxPerTicket: agentCollaborationLimits.linksMaxPerTicket.default,
};

/** Paket 2.4 (§5): one read of the collaboration switches. */
@Injectable()
export class AgentCollaborationConfigurationLoader {
  constructor(private readonly settings: SettingsService) {}

  async load(): Promise<AgentCollaborationConfiguration> {
    const d = defaultAgentCollaborationConfiguration;
    const read = async (key: string) => {
      try {
        return await this.settings.getSetting(key);
      } catch {
        return undefined;
      }
    };
    const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
    const k = settingKeys;
    const [presence, requester, collision, mentions, followers, followOnReply, links, max] = await Promise.all([
      read(k.privateCollaborationPresenceEnabled),
      read(k.privateCollaborationPresenceShowToRequester),
      read(k.privateCollaborationCollisionWarningEnabled),
      read(k.privateCollaborationMentionsEnabled),
      read(k.privateCollaborationFollowersEnabled),
      read(k.privateCollaborationFollowOnReply),
      read(k.privateCollaborationLinksEnabled),
      read(k.privateCollaborationLinksMaxPerTicket),
    ]);
    const range = agentCollaborationLimits.linksMaxPerTicket;
    return {
      presenceEnabled: bool(presence, d.presenceEnabled),
      presenceShowToRequester: bool(requester, d.presenceShowToRequester),
      collisionWarningEnabled: bool(collision, d.collisionWarningEnabled),
      mentionsEnabled: bool(mentions, d.mentionsEnabled),
      followersEnabled: bool(followers, d.followersEnabled),
      followOnReply: bool(followOnReply, d.followOnReply),
      linksEnabled: bool(links, d.linksEnabled),
      linksMaxPerTicket:
        typeof max === 'number' && Number.isInteger(max) && max >= range.min && max <= range.max ? max : range.default,
    };
  }
}

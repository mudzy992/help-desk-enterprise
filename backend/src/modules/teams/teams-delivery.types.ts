/** Paket 3.1 (§8): a TEAMS job carries ids only; the card is built when sent. */
export interface TeamsDeliveryJob {
  readonly target: 'personal' | 'channel';
  readonly teamsConversationId: string;
  readonly notificationId: string;
  /** Personal: recipient (locale, still linked?). */
  readonly userId?: string;
  /** Channel: the group whose link produced the delivery. */
  readonly groupId?: string;
}

export function parseTeamsDeliveryJob(payload: unknown): TeamsDeliveryJob | null {
  if (payload === null || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  const id = (key: string) => (typeof value[key] === 'string' && (value[key] as string).length <= 64 ? (value[key] as string) : undefined);
  if ((value.target !== 'personal' && value.target !== 'channel') || !id('teamsConversationId') || !id('notificationId')) return null;
  return {
    target: value.target,
    teamsConversationId: id('teamsConversationId')!,
    notificationId: id('notificationId')!,
    userId: id('userId'),
    groupId: id('groupId'),
  };
}

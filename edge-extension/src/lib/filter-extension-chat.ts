const staffOnlyMessageTypes = new Set([
  'INTERNAL_NOTE',
  'SYSTEM_EVENT',
  'APPROVAL_DECISION',
]);

export type ExtensionVisibleMessage = {
  readonly id: string;
  readonly type: string;
  readonly body: string;
  readonly createdAt: string;
};

export function filterExtensionChatMessages(
  messages: readonly ExtensionVisibleMessage[],
  maxMessages: number,
): readonly ExtensionVisibleMessage[] {
  const visible = messages.filter(
    (message) => !staffOnlyMessageTypes.has(message.type),
  );
  if (visible.length <= maxMessages) {
    return visible;
  }
  return visible.slice(visible.length - maxMessages);
}

export function isOpenRequesterTicket(input: {
  readonly requesterId: string;
  readonly subjectId: string;
  readonly status: string;
}): boolean {
  return (
    input.requesterId === input.subjectId &&
    input.status !== 'CLOSED' &&
    input.status !== 'ARCHIVED'
  );
}

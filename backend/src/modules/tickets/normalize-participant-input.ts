import type { ParticipantRole } from '../../generated/prisma/enums';
import {
  manuallyAssignableParticipantRoles,
} from './collaboration.constants';
import type { AddTicketParticipantInput } from './collaboration.types';
import { TicketsError } from './tickets.error';

const groupRoles: readonly ParticipantRole[] = [
  'HANDLER_GROUP',
  'FORWARDED_FROM_GROUP',
  'FORWARDED_TO_GROUP',
];

const userRoles: readonly ParticipantRole[] = [
  'REQUESTER',
  'ASSIGNEE',
  'WATCHER',
  'APPROVER',
];

export function normalizeParticipantInput(
  input: AddTicketParticipantInput,
): {
  readonly role: ParticipantRole;
  readonly userId: string | null;
  readonly groupId: string | null;
} {
  if (
    !manuallyAssignableParticipantRoles.includes(
      input.role as (typeof manuallyAssignableParticipantRoles)[number],
    )
  ) {
    throw new TicketsError('INVALID_PARTICIPANT_ROLE');
  }
  const userId = input.userId?.trim() || null;
  const groupId = input.groupId?.trim() || null;
  if (groupRoles.includes(input.role)) {
    if (groupId === null || userId !== null) {
      throw new TicketsError('PARTICIPANT_IDENTITY_REQUIRED');
    }
    return { role: input.role, userId: null, groupId };
  }
  if (userRoles.includes(input.role) || input.role === 'APPROVER') {
    if (input.role === 'APPROVER' && groupId !== null && userId === null) {
      return { role: input.role, userId: null, groupId };
    }
    if (userId === null || groupId !== null) {
      throw new TicketsError('PARTICIPANT_IDENTITY_REQUIRED');
    }
    return { role: input.role, userId, groupId: null };
  }
  throw new TicketsError('INVALID_PARTICIPANT_ROLE');
}

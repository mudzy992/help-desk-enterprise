import { ticketListSelect } from './ticket-list-select';

describe('ticketListSelect', () => {
  const columns = Object.keys(ticketListSelect);

  it('never selects the form data blob', () => {
    expect(columns).not.toContain('formData');
  });

  it('keeps every column the list response and its mappers read', () => {
    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'ticketNumber',
        'title',
        'description',
        'status',
        'priority',
        'impact',
        'urgency',
        'classification',
        'isConfidential',
        'originUnitId',
        'serviceId',
        'formVersionId',
        'requesterId',
        'assignedGroupId',
        'assignedUserId',
        'parentTicketId',
        'mergedIntoTicketId',
        'reopenedFromTicketId',
        'closeCodeId',
        'resolutionNote',
        'resolvedAt',
        'closedAt',
        'archivedAt',
        'waitingForUserEnteredAt',
        'waitingForUserReminderSentAt',
        'firstResponseAt',
        'forwardCount',
        'lastForwardedAt',
        'lastForwardFromGroupName',
        'routedByUnroutedFallback',
        'createdAt',
        'updatedAt',
      ]),
    );
  });

  it('selects exactly those columns, so a new one is a deliberate choice', () => {
    expect(columns.length).toBe(35);
  });
});

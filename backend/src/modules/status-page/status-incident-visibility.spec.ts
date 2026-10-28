import { statusViewerForTicket, withIncidentVisibility, type StatusViewer } from './status-page.service';

const scoped = (scope: NonNullable<StatusViewer['staffScope']>): StatusViewer => ({
  userId: 'agent-1', isStaff: true, canManage: false, staffScope: scope,
});

describe('status incident staff visibility', () => {
  it('allows public incidents but scopes STAFF_ONLY to every affected service', () => {
    const where = withIncidentVisibility({ status: 'INVESTIGATING' }, scoped({
      global: false,
      serviceIds: ['service-a'],
      organizationalUnitPaths: ['/root/a'],
    }));
    expect(where).toEqual({ AND: [
      { status: 'INVESTIGATING' },
      { OR: [
        { visibility: 'ALL_USERS' },
        {
          visibility: 'STAFF_ONLY',
          services: { some: {}, every: { service: { OR: [
            { id: { in: ['service-a'] } },
          ] } } },
        },
      ] },
    ] });
  });

  it('fails closed to ALL_USERS when a scoped staff assignment has no usable resource scope', () => {
    expect(withIncidentVisibility({ id: 'incident-foreign' }, scoped({ global: false, serviceIds: [], organizationalUnitPaths: ['/root/a'] }))).toEqual({
      AND: [{ id: 'incident-foreign' }, { visibility: 'ALL_USERS' }],
    });
  });

  it('does not promote staff ticket access into global status-incident access', () => {
    const viewer = statusViewerForTicket(scoped({ global: false, serviceIds: ['service-a'], organizationalUnitPaths: [] }), true);
    expect(withIncidentVisibility({ tickets: { some: { ticketId: 'ticket-1' } } }, viewer)).toMatchObject({
      AND: [
        { tickets: { some: { ticketId: 'ticket-1' } } },
        { OR: [{ visibility: 'ALL_USERS' }, { visibility: 'STAFF_ONLY' }] },
      ],
    });
    expect(viewer.staffScope).toMatchObject({ global: false, serviceIds: ['service-a'] });
  });

  it('keeps explicit global staff visibility', () => {
    expect(withIncidentVisibility({ id: 'incident-1' }, scoped({ global: true, serviceIds: [], organizationalUnitPaths: [] }))).toEqual({ id: 'incident-1' });
  });
});

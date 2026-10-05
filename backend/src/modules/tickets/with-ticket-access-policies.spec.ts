import { withTicketAccessPolicies } from './with-ticket-access-policies';

const confidential = {
  enabled: false,
  defaultForServiceIds: [],
  allowedViewerRoles: [],
  allowedViewerGroupIds: [],
  breakGlassEnabled: false,
  breakGlassAllowedRoles: [],
  breakGlassRequiresReason: true,
  auditViews: false,
};
const safeLogging = { enabled: false, levels: [], redactFields: [] };
const archive = {
  enabled: false,
  afterClosedDays: 30,
  archivedReadOnly: true,
  searchable: false,
};
const loaders = {
  confidential: { load: async () => confidential },
  safeLogging: { load: async () => safeLogging },
  archive: { load: async () => archive },
};

describe('withTicketAccessPolicies (M7 B5)', () => {
  it('fills priorityMatrixEnabled from the setting when the context is silent', async () => {
    const gated = await withTicketAccessPolicies(
      { actorUserId: 'user-1' },
      {
        ...loaders,
        priorityMatrix: { load: async () => ({ enabled: false }) },
      },
    );
    expect(gated.priorityMatrix).toEqual({ enabled: false });
    expect(gated.priorityMatrixEnabled).toBe(false);
  });

  it('defaults to the matrix being on without a loader', async () => {
    const gated = await withTicketAccessPolicies(
      { actorUserId: 'user-1' },
      loaders,
    );
    expect(gated.priorityMatrix).toEqual({ enabled: true });
    expect(gated.priorityMatrixEnabled).toBe(true);
  });

  it('keeps an explicit context value (workers, harnesses) over the setting', async () => {
    const gated = await withTicketAccessPolicies(
      { actorUserId: 'user-1', priorityMatrixEnabled: false },
      {
        ...loaders,
        priorityMatrix: { load: async () => ({ enabled: true }) },
      },
    );
    expect(gated.priorityMatrixEnabled).toBe(false);
  });

  it('leaves the existing access policies untouched', async () => {
    const gated = await withTicketAccessPolicies(
      { actorUserId: 'user-1' },
      loaders,
    );
    expect(gated.confidential).toBe(confidential);
    expect(gated.safeLogging).toBe(safeLogging);
    expect(gated.archive).toBe(archive);
    expect(gated.actorUserId).toBe('user-1');
  });
});

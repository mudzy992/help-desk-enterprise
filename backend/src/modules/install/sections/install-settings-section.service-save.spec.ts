import { settingKeys } from '../../settings/setting-keys';
import { createInstallWizardHarness } from '../create-install-wizard-harness';
import { InstallSettingsSectionService } from './install-settings-section.service';
import type { CreateInstallTeamMember } from '../install-team.service';
import { installSettingsSectionConstants } from './install-settings-section.constants';

/**
 * F5: one generic mechanism for the Full package's content. The suite is about
 * the boundary the wizard adds — the allowlist, the marker and the dependency
 * rules — because everything else (validation, `requires`, dependent resets,
 * secrets, change log) is `SettingsService` behaviour and is covered there.
 */
async function createSectionHarness() {
  const harness = await createInstallWizardHarness();
  return {
    ...harness,
    sectionService: new InstallSettingsSectionService(
      harness.prisma,
      harness.settingsService,
      harness.registry,
    ),
  };
}

/**
 * The in-memory double stores rows (`{ key, value, … }`), exactly like
 * `appSetting` does — specs assert on the value they care about.
 */
function storedValue(
  harness: Awaited<ReturnType<typeof createInstallWizardHarness>>,
  key: string,
): unknown {
  return harness.readStored(key)?.value;
}

/** Invites one colleague through the real team step, the way the wizard does. */
function creatorThat(
  harness: Awaited<ReturnType<typeof createInstallWizardHarness>>,
): CreateInstallTeamMember {
  let sequence = 1;
  return async (_prisma, input) => {
    const user = {
      id: `invited-${sequence++}`,
      displayName: input.displayName,
      email: input.email,
    };
    harness.memory.seedUser(
      {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isActive: true,
        isLocalOnly: true,
        localPasswordHash: 'hash',
        entraObjectId: null,
      },
      input.roleKey,
    );
    return { user, temporaryPassword: 'privremena-1', temporaryPasswordDelivery: 'ui' };
  };
}

async function inviteColleague(
  harness: Awaited<ReturnType<typeof createInstallWizardHarness>>,
): Promise<void> {
  await harness.seedMinimum();
  await harness.teamService.save(
    {
      members: [
        { displayName: 'Amina Hodžić', email: 'amina@example.com', roleKey: 'AGENT' },
      ],
    },
    creatorThat(harness),
  );
}

// The write half of the same service: what a save carries, what it refuses and
// what it proves afterwards. A separate file because a spec may not grow past the
// project's 200-line limit; the two files are read together.
describe('InstallSettingsSectionService (saves)', () => {
it('writes the answered marker with the allowlisted values', async () => {
    const harness = await createSectionHarness();
    await harness.seedMinimum();

    const status = await harness.sectionService.saveSection('inboundEmail', {
      values: [
        { key: settingKeys.privateInboundEnabled, value: true },
        { key: settingKeys.privateInboundAddress, value: 'podrska@example.com' },
        { key: settingKeys.privateInboundCreateTickets, value: true },
      ],
    });

    expect(status.answered).toBe(true);
    expect(storedValue(harness, settingKeys.privateInboundEnabled)).toBe(true);
    expect(storedValue(harness, settingKeys.privateInboundAddress)).toBe(
      'podrska@example.com',
    );
    // Every write comes with the wizard's reason, so the audit trail says who did
    // it and why.
    const reasons = harness.settingsMemory.changeLogs
      .filter((entry) => entry.entityId === settingKeys.privateInboundEnabled)
      .map((entry) => entry.reason);
    expect(reasons).toEqual([installSettingsSectionConstants.changeLogReason]);
  });

  it('answers a section without a value, and never overwrites a secret with the placeholder', async () => {
    const harness = await createSectionHarness();
    // The secret depends on the URL (the definition's own `requires`), so the
    // deployment has one before the wizard ever gets here.
    await harness.settingsService.setSettingValue(
      settingKeys.privateSecurityAuditWebhookUrl,
      'https://audit.example.com/hook',
      { reason: 'test', actorUserId: harness.actorUserId },
    );
    await harness.settingsService.setSettingValue(
      settingKeys.privateSecurityAuditWebhookSecret,
      'stvarna-tajna',
      { reason: 'test', actorUserId: harness.actorUserId },
    );

    const read = await harness.sectionService.getSection('auditWebhook');
    const secret = read.fields.find(
      (field) => field.key === settingKeys.privateSecurityAuditWebhookSecret,
    );
    expect({ visibility: secret?.visibility, value: secret?.value, isSet: secret?.isSet }).toEqual(
      { visibility: 'secret', value: '[REDACTED]', isSet: true },
    );

    // „Sačuvaj“ without a change: the marker is the whole answer.
    const answered = await harness.sectionService.saveSection('auditWebhook', {
      values: [{ key: settingKeys.privateSecurityAuditWebhookSecret, value: '[REDACTED]' }],
    });
    expect(answered.answered).toBe(true);
    expect(
      storedValue(harness, settingKeys.privateSecurityAuditWebhookSecret),
    ).toBe('stvarna-tajna');
  });

  it('honours the requires of the definitions', async () => {
    const harness = await createSectionHarness();
    await expect(
      harness.sectionService.saveSection('announcements', {
        values: [
          { key: settingKeys.privateAnnouncementsAgentsMayPublish, value: true },
        ],
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('refuses to switch a section on before its dependency exists', async () => {
    const harness = await createSectionHarness();
    await expect(
      harness.sectionService.saveSection('onCall', {
        values: [{ key: settingKeys.privateOnCallEnabled, value: true }],
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'INSTALL_SETTINGS_SECTION_DEPENDENCY_UNMET',
        details: { dependencies: ['team'] },
      },
    });
  });

  it('saves the same section once the dependency is in place', async () => {
    const harness = await createSectionHarness();
    await inviteColleague(harness);

    const status = await harness.sectionService.saveSection('onCall', {
      values: [
        { key: settingKeys.privateOnCallEnabled, value: true },
        { key: settingKeys.privateOnCallReminderTime, value: '15:00' },
      ],
    });

    expect(status.answered).toBe(true);
    expect(status.dependencies).toEqual([
      { dependency: 'team', satisfied: true },
    ]);
    expect(storedValue(harness, settingKeys.privateOnCallEnabled)).toBe(true);
  });

  it('refuses the requests when no founder account exists yet', async () => {
    const harness = await createInstallWizardHarness({ withSuperAdmin: false });
    const service = new InstallSettingsSectionService(
      harness.prisma,
      harness.settingsService,
      harness.registry,
    );
    await expect(
      service.saveSection('knowledgeBase', {
        values: [{ key: settingKeys.privateKnowledgeBaseFeedbackEnabled, value: true }],
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'SUPER_ADMIN_REQUIRED' },
    });
  });
});

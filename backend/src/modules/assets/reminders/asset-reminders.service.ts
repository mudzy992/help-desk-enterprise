import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { authorizationRoleKeys, permissionKeys } from '../../authorization/authorization.constants';
import { resolveEmailLocale } from '../../notifications/email/compose-ticket-email';
import { deliverNotificationEmail } from '../../notifications/email/deliver-notification-email';
import { isAllowedNotificationEmailAddress } from '../../notifications/email/is-allowed-notification-email-address';
import { loadEmailChannelConfiguration, type EmailChannelConfiguration } from '../../notifications/email/load-email-channel-configuration';
import { MAIL_TRANSPORT, type MailTransport } from '../../notifications/email/mail-transport';
import { persistInAppNotification } from '../../notifications/fan-out/persist-in-app-notification';
import { notificationTypes } from '../../notifications/notifications.constants';
import { loadNotificationPreferencePolicy } from '../../notifications/preferences/notification-preference-policy';
import { resolveDeliveryDecisions } from '../../notifications/preferences/resolve-delivery-decisions';
import { assetDefaults, parseReminderDays } from '../../settings/definitions/asset-settings';
import { readInstallationTimeZone } from '../../settings/read-installation-time-zone';
import { settingKeys } from '../../settings/setting-keys';
import { SettingsService } from '../../settings/settings.service';
import { isPathInScope, type AssetScope } from '../asset-viewer';
import {
  assetRemindersLocalStartHour,
  assetRemindersMaxItems,
  assetRemindersMaxRecipients,
} from './asset-reminders.constants';
import {
  assetReminderSummary,
  composeAssetReminderEmail,
  type AssetReminderKind,
  type AssetReminderLine,
} from './compose-asset-reminder-email';
import { localHour, planAssetReminders, type ReminderDecision } from './plan-asset-reminders';

type ScopedLine = AssetReminderLine & { readonly unitPath: string };

type Recipient = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly preferredLocale: string | null;
  /** Per reminder kind: the unit scope in which the user manages it. */
  readonly scopes: Readonly<Record<AssetReminderKind, AssetScope>>;
};

export type AssetRemindersRunResult = {
  readonly skipped: string | null;
  readonly items: number;
  readonly recipients: number;
  readonly emails: number;
  readonly inApp: number;
};

/** Permissions that make a user responsible for each reminder kind (§10, §14). */
const kindPermissions: Readonly<Record<AssetReminderKind, readonly string[]>> = {
  warranty: [permissionKeys.assetManage],
  contract: [permissionKeys.assetManage, permissionKeys.assetContractManage],
  license: [permissionKeys.assetManage, permissionKeys.assetLicenseManage],
};
const allManagePermissions = [...new Set(Object.values(kindPermissions).flat())];
const globalRoleKeys = new Set<string>([authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin]);

function formatDate(value: Date, locale: 'bs' | 'en', timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'bs' ? 'bs-BA' : 'en-GB', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(value);
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

function localDateKey(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Paket 3.2 (§10): daily expiry reminders. One in-app notification and one
 * e-mail per responsible user with every item of their scope that crossed a
 * threshold, plus the extra (internal) addresses from the settings. The
 * `remindersSent` arrays are written only after the run, so an item is never
 * reminded twice for the same threshold; a crash before that repeats the run
 * and the per-day dedupe keys keep the notification from doubling.
 */
@Injectable()
export class AssetRemindersService {
  private readonly logger = new Logger(AssetRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
  ) {}

  private async read<T>(key: string, fallback: T): Promise<T> {
    try {
      const value = await this.settings.getSetting(key);
      return value === undefined || value === null ? fallback : (value as T);
    } catch {
      return fallback;
    }
  }

  async run(now: Date = new Date(), options: { readonly ignoreHour?: boolean } = {}): Promise<AssetRemindersRunResult> {
    const empty = (skipped: string): AssetRemindersRunResult => ({ skipped, items: 0, recipients: 0, emails: 0, inApp: 0 });
    if ((await this.read<unknown>(settingKeys.privateAddonsCmdb, false)) !== true) return empty('module_disabled');
    if ((await this.read<unknown>(settingKeys.privateAssetsRemindersEnabled, assetDefaults.remindersEnabled)) !== true) {
      return empty('reminders_disabled');
    }
    const timeZone = await readInstallationTimeZone(this.settings);
    if (options.ignoreHour !== true && localHour(now, timeZone) < assetRemindersLocalStartHour) return empty('before_start_hour');
    const thresholds =
      parseReminderDays(await this.read<unknown>(settingKeys.privateAssetsRemindersDaysBefore, assetDefaults.remindersDaysBefore)) ??
      parseReminderDays(assetDefaults.remindersDaysBefore) ??
      [];
    const horizon = new Date(now.getTime() + (Math.max(...thresholds, 0) + 1) * 86_400_000);
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [assets, contracts, licenses] = await Promise.all([
      this.prisma.asset.findMany({
        where: { retiredAt: null, warrantyEndsAt: { gte: today, lte: horizon } },
        take: assetRemindersMaxItems,
        select: {
          id: true,
          assetTag: true,
          name: true,
          warrantyEndsAt: true,
          warrantyRemindersSent: true,
          organizationalUnit: { select: { name: true, ouPath: true } },
        },
      }),
      this.prisma.assetContract.findMany({
        where: { endsAt: { gte: today, lte: horizon } },
        take: assetRemindersMaxItems,
        select: { id: true, supplier: true, reference: true, endsAt: true, remindersSent: true, organizationalUnit: { select: { name: true, ouPath: true } } },
      }),
      this.prisma.softwareLicense.findMany({
        where: { validUntil: { gte: today, lte: horizon } },
        take: assetRemindersMaxItems,
        select: { id: true, productName: true, vendor: true, validUntil: true, remindersSent: true, organizationalUnit: { select: { name: true, ouPath: true } } },
      }),
    ]);

    const assetPlan = planAssetReminders(
      assets.map((row) => ({ id: row.id, endsAt: row.warrantyEndsAt as Date, remindersSent: row.warrantyRemindersSent })),
      thresholds,
      now,
    );
    const contractPlan = planAssetReminders(
      contracts.map((row) => ({ id: row.id, endsAt: row.endsAt, remindersSent: row.remindersSent })),
      thresholds,
      now,
    );
    const licensePlan = planAssetReminders(
      licenses.map((row) => ({ id: row.id, endsAt: row.validUntil as Date, remindersSent: row.remindersSent })),
      thresholds,
      now,
    );
    const lines: ScopedLine[] = [];
    const byId = <T extends { id: string }>(rows: readonly T[]) => new Map(rows.map((row) => [row.id, row]));
    const assetById = byId(assets);
    const contractById = byId(contracts);
    const licenseById = byId(licenses);
    const push = (kind: AssetReminderKind, decision: ReminderDecision, label: string, endsAt: Date, unit: { name: string; ouPath: string }, path: string) =>
      lines.push({
        kind,
        id: decision.id,
        label,
        unitName: unit.name,
        unitPath: unit.ouPath,
        endsAt: formatDate(endsAt, 'bs', 'UTC'),
        daysLeft: decision.daysLeft,
        path,
      });
    for (const decision of assetPlan) {
      const row = assetById.get(decision.id);
      if (row) push('warranty', decision, `${row.assetTag} · ${row.name}`, row.warrantyEndsAt as Date, row.organizationalUnit, `/assets/${row.id}`);
    }
    for (const decision of contractPlan) {
      const row = contractById.get(decision.id);
      if (row) push('contract', decision, [row.supplier, row.reference].filter(Boolean).join(' — '), row.endsAt, row.organizationalUnit, `/assets?tab=contracts`);
    }
    for (const decision of licensePlan) {
      const row = licenseById.get(decision.id);
      if (row) push('license', decision, [row.productName, row.vendor].filter(Boolean).join(' — '), row.validUntil as Date, row.organizationalUnit, `/assets?tab=licenses`);
    }
    if (lines.length === 0) return empty('nothing_due');

    const recipients = await this.recipients();
    const dateKey = localDateKey(now, timeZone);
    const channel = await loadEmailChannelConfiguration(this.settings).catch(() => null);
    const policy = await loadNotificationPreferencePolicy(this.settings);
    const decisions = await resolveDeliveryDecisions(this.prisma, policy, {
      type: notificationTypes.assetExpiring,
      userIds: recipients.map((recipient) => recipient.id),
      now,
    });
    let emails = 0;
    let inApp = 0;
    let reached = 0;
    for (const recipient of recipients) {
      const own = lines.filter((line) => isPathInScope(recipient.scopes[line.kind], line.unitPath));
      if (own.length === 0) continue;
      reached += 1;
      const decision = decisions.get(recipient.id);
      const dedupeKey = `asset-expiring:${dateKey}`;
      if (decision?.inApp !== false) {
        const created = await persistInAppNotification(this.prisma, {
          userId: recipient.id,
          type: notificationTypes.assetExpiring,
          title: 'notifications.items.assetExpiring',
          body: `${assetReminderSummary('bs', own.length)}: ${own
            .slice(0, 3)
            .map((line) => line.label)
            .join(', ')}${own.length > 3 ? ' …' : ''}`,
          ticketId: null,
          payload: {
            ticketId: '',
            ticketNumber: '',
            event: notificationTypes.assetExpiring,
            messageId: dedupeKey,
            actorUserId: null,
            confidential: false,
            count: own.length,
            title: assetReminderSummary('en', own.length),
          } as never,
          dedupeKey: `${dedupeKey}:${recipient.id}`,
        }).catch((error: unknown) => {
          this.logger.warn(`asset_reminder_in_app_failed user=${recipient.id} reason=${errorText(error)}`);
          return null;
        });
        if (created !== null) inApp += 1;
      }
      if (decision?.email !== 'OFF' && channel !== null && channel.deliveryEnabled && channel.smtp !== null) {
        if (await this.sendToUser(channel, recipient, own, dateKey, now, timeZone)) emails += 1;
      }
    }
    emails += await this.sendToExtras(channel, lines, dateKey, now, timeZone);

    // Record the thresholds only after delivery was attempted.
    await this.prisma.$transaction([
      ...assetPlan.map((decision) =>
        this.prisma.asset.update({ where: { id: decision.id }, data: { warrantyRemindersSent: decision.remindersSent } }),
      ),
      ...contractPlan.map((decision) =>
        this.prisma.assetContract.update({ where: { id: decision.id }, data: { remindersSent: decision.remindersSent } }),
      ),
      ...licensePlan.map((decision) =>
        this.prisma.softwareLicense.update({ where: { id: decision.id }, data: { remindersSent: decision.remindersSent } }),
      ),
    ]);
    const result = { skipped: null, items: lines.length, recipients: reached, emails, inApp };
    this.logger.log(
      `asset_reminders items=${result.items} recipients=${result.recipients} emails=${result.emails} in_app=${result.inApp}`,
    );
    return result;
  }

  private async sendToUser(
    channel: EmailChannelConfiguration,
    recipient: Recipient,
    lines: readonly AssetReminderLine[],
    dateKey: string,
    now: Date,
    timeZone: string,
  ): Promise<boolean> {
    if (!isAllowedNotificationEmailAddress(recipient.email, emailPolicy(channel))) return false;
    const locale = resolveEmailLocale(recipient.preferredLocale, channel);
    const dedupeKey = `asset-expiring:${dateKey}`;
    const composed = composeAssetReminderEmail({
      configuration: channel,
      locale,
      recipientKey: recipient.id,
      recipientName: recipient.displayName,
      lines,
      dateLabel: formatDate(now, locale, timeZone),
      dedupeKey,
    });
    try {
      await deliverNotificationEmail(this.prisma, this.mailTransport, channel, {
        userId: recipient.id,
        toAddress: recipient.email,
        dedupeKey,
        templateKey: 'asset.expiring',
        subject: composed.subject,
        text: composed.text,
        html: composed.html,
        messageId: composed.messageId,
        headers: composed.headers,
      });
      return true;
    } catch (error) {
      this.logger.warn(`asset_reminder_email_failed user=${recipient.id} reason=${errorText(error)}`);
      return false;
    }
  }

  /** §10: extra internal addresses get the full list (they have no unit scope). */
  private async sendToExtras(
    channel: EmailChannelConfiguration | null,
    lines: readonly AssetReminderLine[],
    dateKey: string,
    now: Date,
    timeZone: string,
  ): Promise<number> {
    if (channel === null || !channel.deliveryEnabled || channel.smtp === null) return 0;
    const raw = await this.read<string>(settingKeys.privateAssetsRemindersRecipients, '');
    const addresses = [
      ...new Set(
        String(raw)
          .split(',')
          .map((part) => part.trim().toLowerCase())
          .filter((part) => part.length > 0),
      ),
    ].slice(0, 20);
    let sent = 0;
    for (const address of addresses) {
      // §10: extra recipients are internal only, whatever the global policy says.
      if (!isAllowedNotificationEmailAddress(address, { ...emailPolicy(channel), internalOnly: true })) continue;
      const locale = resolveEmailLocale(null, channel);
      const composed = composeAssetReminderEmail({
        configuration: channel,
        locale,
        recipientKey: address,
        recipientName: locale === 'bs' ? 'kolega' : 'colleague',
        lines,
        dateLabel: formatDate(now, locale, timeZone),
        dedupeKey: `asset-expiring:${dateKey}`,
      });
      try {
        await this.mailTransport.send(
          { from: channel.smtp.fromAddress, to: address, subject: composed.subject, text: composed.text, html: composed.html, messageId: composed.messageId, headers: composed.headers },
          channel.smtp,
        );
        sent += 1;
      } catch (error) {
        this.logger.warn(`asset_reminder_extra_failed reason=${errorText(error)}`);
      }
    }
    return sent;
  }

  /** Active users holding a manage permission, with the unit scope per kind. */
  private async recipients(): Promise<Recipient[]> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        anonymizedAt: null,
        userRoles: {
          some: {
            role: {
              OR: [
                { key: { in: [...globalRoleKeys] } },
                { rolePermissions: { some: { permission: { key: { in: allManagePermissions } } } } },
              ],
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: assetRemindersMaxRecipients,
      select: {
        id: true,
        email: true,
        displayName: true,
        preferredLocale: true,
        organizationalUnit: { select: { ouPath: true } },
        userRoles: {
          select: {
            organizationalUnit: { select: { ouPath: true } },
            role: { select: { key: true, rolePermissions: { select: { permission: { select: { key: true } } } } } },
          },
        },
      },
    });
    return users.map((user) => {
      const scopeFor = (permissions: readonly string[]): AssetScope => {
        const paths: string[] = [];
        for (const assignment of user.userRoles) {
          const keys = assignment.role.rolePermissions.map((entry) => entry.permission.key);
          const global = globalRoleKeys.has(assignment.role.key);
          if (!global && !keys.some((key) => permissions.includes(key))) continue;
          if (global) return { all: true };
          const path = assignment.organizationalUnit?.ouPath ?? user.organizationalUnit?.ouPath ?? null;
          if (path !== null) paths.push(path);
        }
        return { all: false, paths };
      };
      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        preferredLocale: user.preferredLocale,
        scopes: {
          warranty: scopeFor(kindPermissions.warranty),
          contract: scopeFor(kindPermissions.contract),
          license: scopeFor(kindPermissions.license),
        },
      };
    });
  }
}

function emailPolicy(channel: EmailChannelConfiguration) {
  return {
    internalOnly: channel.internalOnly,
    internalDomains: channel.internalDomains,
    allowedExternalDomains: channel.allowedExternalDomains,
    allowedExternalEmails: channel.allowedExternalEmails,
  };
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

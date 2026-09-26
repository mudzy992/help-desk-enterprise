import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/i18n/use-locale";
import { queryKeys } from "@/lib/query/query-keys";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import { ApiError } from "@/services/api";
import {
  diffNotificationPreferences,
  getNotificationPreferences,
  quarterHourOptions,
  resetNotificationPreferences,
  sendTestDigest,
  updateNotificationPreferences,
  type NotificationEmailMode,
  type NotificationPreferenceCategory,
  type NotificationPreferenceCategoryKey,
  type NotificationPreferences,
} from "@/services/notification-preferences-api";

type CategoryLabelKey = `account.notifications.categories.${Replace<NotificationPreferenceCategoryKey>}`;
type Replace<S extends string> = S extends `${infer Head}.${infer Tail}` ? `${Head}_${Replace<Tail>}` : S;

const categoryLabel = (key: NotificationPreferenceCategoryKey) =>
  `account.notifications.categories.${key.replace(/\./g, "_")}` as CategoryLabelKey;

const emailModes: readonly NotificationEmailMode[] = ["IMMEDIATE", "DIGEST", "OFF"];

/**
 * Paket 2.2 (N10): "Moj profil → Notifikacije". A draft copy is edited
 * locally and saved in one PUT with only the changed values.
 */
export function AccountNotificationsPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.accountNotifications, queryFn: getNotificationPreferences });
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [busy, setBusy] = useState<"save" | "reset" | "test" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [problems, setProblems] = useState<readonly string[]>([]);

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const saved = query.data;
  const changes = useMemo(
    () => (saved && draft ? diffNotificationPreferences(saved, draft) : {}),
    [saved, draft],
  );
  const dirty = Object.keys(changes).length > 0;

  const apply = (next: NotificationPreferences) => {
    queryClient.setQueryData(queryKeys.accountNotifications, next);
    setDraft(next);
  };

  const save = async () => {
    setBusy("save");
    setProblems([]);
    try {
      apply(await updateNotificationPreferences(changes));
      toast({ tone: "success", title: t("account.notifications.saved") });
    } catch (caught) {
      const details = caught instanceof ApiError ? caught.details : null;
      setProblems(Array.isArray(details) ? (details as string[]) : []);
      toast({ tone: "danger", title: t("account.notifications.saveFailed") });
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setBusy("reset");
    try {
      apply(await resetNotificationPreferences());
      setConfirmReset(false);
      toast({ tone: "success", title: t("account.notifications.resetDone") });
    } catch {
      toast({ tone: "danger", title: t("account.notifications.saveFailed") });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      await sendTestDigest();
      toast({ tone: "success", title: t("account.notifications.testSent") });
    } catch (caught) {
      const rateLimited = caught instanceof ApiError && caught.status === 429;
      toast({
        tone: "danger",
        title: t(rateLimited ? "account.notifications.testRateLimited" : "account.notifications.testFailed"),
      });
    } finally {
      setBusy(null);
    }
  };

  const updateCategory = (key: NotificationPreferenceCategoryKey, patch: Partial<NotificationPreferenceCategory>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            categories: current.categories.map((category) =>
              category.key === key ? { ...category, ...patch } : category,
            ),
          }
        : current,
    );

  const updateSchedule = (patch: Partial<NotificationPreferences["schedule"]>) =>
    setDraft((current) => (current ? { ...current, schedule: { ...current.schedule, ...patch } } : current));

  const policy = draft?.policy;
  const editable = policy?.preferencesEnabled === true;

  return (
    <div className="page-in mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <PageHeader
        crumbs={[t("account.security.crumb")]}
        title={t("account.notifications.title")}
        subtitle={t("account.notifications.subtitle")}
        actions={
          editable ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmReset(true)} disabled={busy !== null}>
                {t("account.notifications.reset")}
              </Button>
              <Button type="button" size="sm" onClick={() => void save()} disabled={!dirty || busy !== null}>
                {busy === "save" ? t("account.notifications.saving") : t("account.notifications.save")}
              </Button>
            </div>
          ) : null
        }
      />
      {query.isError ? (
        <p className={errorTextClassName} role="alert">
          {t("account.notifications.loadFailed")}
        </p>
      ) : null}
      {query.isPending ? <PanelSkeleton label={t("account.notifications.title")} /> : null}
      {draft && policy ? (
        <div className="space-y-5">
          {!editable ? (
            <p className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground">
              {t("account.notifications.disabledByAdmin")}
            </p>
          ) : null}
          {!policy.emailChannelAvailable ? (
            <p className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground">
              {t("account.notifications.emailUnavailable")}
            </p>
          ) : null}
          {problems.length > 0 ? (
            <ul className={errorTextClassName} role="alert" data-testid="notification-preferences-problems">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}

          <Card>
            <CardHeader title={t("account.notifications.eventsTitle")} subtitle={t("account.notifications.eventsSubtitle")} />
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]" data-testid="notification-preferences-table">
                <thead>
                  <tr className="border-b border-border/70 text-left text-[11.5px] text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{t("account.notifications.columnEvent")}</th>
                    <th className="px-4 py-2 font-medium">{t("account.notifications.columnInApp")}</th>
                    <th className="px-4 py-2 font-medium">{t("account.notifications.columnEmail")}</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.categories.map((category) => (
                    <tr key={category.key} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 align-top">
                        <p className="font-medium text-foreground">{t(`${categoryLabel(category.key)}.label`)}</p>
                        <p className="text-[11.5px] text-muted-foreground">{t(`${categoryLabel(category.key)}.hint`)}</p>
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={category.inApp}
                            disabled={!editable || category.alwaysOn || category.inAppLocked}
                            onCheckedChange={(checked) => updateCategory(category.key, { inApp: checked })}
                            aria-label={`${t(`${categoryLabel(category.key)}.label`)} — ${t("account.notifications.columnInApp")}`}
                          />
                          {category.alwaysOn || category.inAppLocked ? <LockHint alwaysOn={category.alwaysOn} /> : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        {category.channels.email ? (
                          <div className="flex items-center gap-1.5">
                            <Select
                              value={category.email}
                              disabled={!editable || category.emailLocked}
                              onChange={(event) =>
                                updateCategory(category.key, { email: event.target.value as NotificationEmailMode })
                              }
                              aria-label={`${t(`${categoryLabel(category.key)}.label`)} — ${t("account.notifications.columnEmail")}`}
                              className="w-auto min-w-[9rem]"
                            >
                              {emailModes
                                .filter((mode) => mode !== "DIGEST" || policy.digestEnabled || category.email === "DIGEST")
                                .map((mode) => (
                                  <option key={mode} value={mode}>
                                    {t(`account.notifications.emailMode.${mode}`)}
                                  </option>
                                ))}
                            </Select>
                            {category.emailLocked ? <LockHint alwaysOn={false} /> : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t("account.notifications.inAppOnly")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {policy.digestEnabled ? (
            <Card>
              <CardHeader
                title={t("account.notifications.digestTitle")}
                subtitle={t("account.notifications.digestSubtitle", { zone: policy.timeZone })}
              />
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <Field label={t("account.notifications.digestTime")}>
                  <Select
                    value={draft.schedule.digestTime ?? ""}
                    disabled={!editable}
                    onChange={(event) => updateSchedule({ digestTime: event.target.value === "" ? null : event.target.value })}
                  >
                    <option value="">
                      {t("account.notifications.digestTimeDefault", { time: policy.digestDefaultTime })}
                    </option>
                    {quarterHourOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="flex items-end pb-1.5">
                  <Checkbox
                    label={t("account.notifications.digestWorkdaysOnly")}
                    checked={draft.schedule.digestWorkdaysOnly}
                    disabled={!editable}
                    onChange={(event) => updateSchedule({ digestWorkdaysOnly: event.target.checked })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground sm:col-span-2">
                  {draft.digest.nextAt ? (
                    <span>{t("account.notifications.digestNext", { at: formatTicketTimestamp(draft.digest.nextAt, locale) })}</span>
                  ) : null}
                  <Badge>{t("account.notifications.digestPending", { count: draft.digest.pendingItems })}</Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null || !policy.emailChannelAvailable}
                    onClick={() => void test()}
                  >
                    {t("account.notifications.testDigest")}
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          {policy.quietHoursEnabled ? (
            <Card>
              <CardHeader
                title={t("account.notifications.quietTitle")}
                subtitle={t("account.notifications.quietSubtitle")}
                actions={
                  <Switch
                    checked={draft.schedule.quietHoursEnabled}
                    disabled={!editable}
                    onCheckedChange={(checked) => updateSchedule({ quietHoursEnabled: checked })}
                    aria-label={t("account.notifications.quietTitle")}
                  />
                }
              />
              <div className="grid gap-4 p-4 sm:grid-cols-3">
                <Field label={t("account.notifications.quietStart")}>
                  <Select
                    value={draft.schedule.quietStart}
                    disabled={!editable || !draft.schedule.quietHoursEnabled}
                    onChange={(event) => updateSchedule({ quietStart: event.target.value })}
                  >
                    {quarterHourOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("account.notifications.quietEnd")}>
                  <Select
                    value={draft.schedule.quietEnd}
                    disabled={!editable || !draft.schedule.quietHoursEnabled}
                    onChange={(event) => updateSchedule({ quietEnd: event.target.value })}
                  >
                    {quarterHourOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="flex items-end pb-1.5">
                  <Checkbox
                    label={t("account.notifications.quietWeekends")}
                    checked={draft.schedule.quietWeekends}
                    disabled={!editable}
                    onChange={(event) => updateSchedule({ quietWeekends: event.target.checked })}
                  />
                </div>
                <p className="text-[11.5px] text-muted-foreground sm:col-span-3">{t("account.notifications.quietHint")}</p>
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("account.notifications.reset")}
        description={t("account.notifications.resetHint")}
        confirmLabel={t("account.notifications.resetConfirm")}
        intent="danger"
        isPending={busy === "reset"}
        onConfirm={() => void reset()}
      />
    </div>
  );
}

function LockHint({ alwaysOn }: { readonly alwaysOn: boolean }) {
  const { t } = useTranslation();
  const label = t(alwaysOn ? "account.notifications.alwaysOn" : "account.notifications.locked");
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={label}>
      <Lock size={12} aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </span>
  );
}

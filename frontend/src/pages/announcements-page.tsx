import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { BarChart3, Megaphone, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { AnnouncementEditorDialog } from "@/components/announcements/announcement-editor-dialog";
import { AnnouncementReportDialog } from "@/components/announcements/announcement-report-dialog";
import { MarkdownView } from "@/components/privacy/markdown-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { mapAnnouncementError, severityTone, statusTone } from "@/lib/announcements/announcement-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  announcementQueryKeys,
  deleteAnnouncement,
  getAnnouncementArchive,
  getAnnouncementCapabilities,
  getAnnouncementOptions,
  listManagedAnnouncements,
  previewAnnouncementAudience,
  publishAnnouncement,
  withdrawAnnouncement,
  type AnnouncementEffectiveStatus,
  type AnnouncementList,
  type AnnouncementOptions,
  type ManagedAnnouncement,
} from "@/services/announcements-api";

const severityKeys = {
  INFO: "announcements.severity.INFO",
  WARNING: "announcements.severity.WARNING",
  CRITICAL: "announcements.severity.CRITICAL",
} as const;

const statusKeys: Readonly<Record<AnnouncementEffectiveStatus, `announcements.status.${AnnouncementEffectiveStatus}`>> = {
  DRAFT: "announcements.status.DRAFT",
  SCHEDULED: "announcements.status.SCHEDULED",
  PUBLISHED: "announcements.status.PUBLISHED",
  ENDED: "announcements.status.ENDED",
  WITHDRAWN: "announcements.status.WITHDRAWN",
};

type PendingAction =
  | { readonly kind: "publish"; readonly item: ManagedAnnouncement; readonly audience: number | null }
  | { readonly kind: "withdraw"; readonly item: ManagedAnnouncement }
  | { readonly kind: "delete"; readonly item: ManagedAnnouncement };

/**
 * Paket 2.9 (K2, §3.2–3.3): the user's announcement archive (90 days) and,
 * for those allowed to publish, the management list with editor and report.
 */
export function AnnouncementsPage() {
  const { t } = useTranslation();
  const { data: capabilities, isLoading } = useQuery({
    queryKey: announcementQueryKeys.capabilities,
    queryFn: getAnnouncementCapabilities,
    retry: false,
  });
  const [tab, setTab] = useState<"mine" | "manage">("mine");

  const header = <PageHeader crumbs={[t("navigation.sections.overview")]} title={t("announcements.title")} subtitle={t("announcements.subtitle")} />;

  if (isLoading) {
    return (
      <div>
        {header}
        <PanelSkeleton label={t("ui.loading")} />
      </div>
    );
  }
  if (capabilities !== undefined && !capabilities.enabled) {
    return (
      <div>
        {header}
        <EmptyState icon={<Megaphone size={18} />} title={t("announcements.disabledTitle")} body={t("announcements.disabledBody")} />
      </div>
    );
  }
  const canManage = capabilities?.canManage === true;
  return (
    <div className="grid gap-4">
      {header}
      {canManage ? (
        <UnderlineTabs
          items={[
            { key: "mine", label: t("announcements.tabs.mine") },
            { key: "manage", label: t("announcements.tabs.manage") },
          ]}
          active={tab}
          onChange={(key) => setTab(key === "manage" ? "manage" : "mine")}
        />
      ) : null}
      {canManage && tab === "manage" ? <ManageAnnouncements /> : <AnnouncementArchive />}
    </div>
  );
}

function AnnouncementArchive() {
  const { t, i18n } = useTranslation();
  const { data, error, isLoading } = useQuery({
    queryKey: announcementQueryKeys.archive,
    queryFn: getAnnouncementArchive,
    retry: false,
  });
  const [searchParams] = useSearchParams();
  const openId = searchParams.get("open");
  // K2b: e-mail/Teams links (?open=<id>) expand and scroll to the announcement.
  useEffect(() => {
    if (openId === null || data === undefined) return;
    const element = document.getElementById(`announcement-${openId}`);
    if (element instanceof HTMLDetailsElement) {
      element.open = true;
      element.scrollIntoView({ block: "start" });
      element.querySelector("summary")?.focus({ preventScroll: true });
    }
  }, [openId, data]);
  const formatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });
  if (isLoading) return <PanelSkeleton label={t("ui.loading")} />;
  if (error) {
    return (
      <p role="alert" className={errorTextClassName}>
        {t(mapAnnouncementError(error) ?? mapApiError(error))}
      </p>
    );
  }
  if (data === undefined || data.length === 0) {
    return <EmptyState icon={<Megaphone size={18} />} title={t("announcements.archive.emptyTitle")} body={t("announcements.archive.emptyBody")} />;
  }
  return (
    <ul className="grid gap-3" aria-label={t("announcements.archive.label")}>
      {data.map((item) => (
        <li key={item.id}>
          <Card>
            <details className="group" id={`announcement-${item.id}`}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70">
                <Badge tone={severityTone(item.severity)}>{t(severityKeys[item.severity])}</Badge>
                <span className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">{item.title}</span>
                {item.requiresAcknowledgement ? (
                  item.acknowledgedAt ? (
                    <Badge tone="success">
                      {t("announcements.archive.acknowledgedAt", { at: formatter.format(new Date(item.acknowledgedAt)) })}
                    </Badge>
                  ) : (
                    <Badge tone="warning">{t("announcements.archive.notAcknowledged")}</Badge>
                  )
                ) : null}
                <span className="text-[11.5px] text-muted-foreground">
                  {formatter.format(new Date(item.startsAt))} – {formatter.format(new Date(item.endsAt))}
                </span>
              </summary>
              <div className="border-t border-border/70 px-4 py-3">
                {item.serviceName ? <p className={hintClassName}>{t("announcements.banner.service", { name: item.serviceName })}</p> : null}
                <MarkdownView source={item.body} className="grid gap-2 text-[12.5px] leading-5 text-foreground" />
              </div>
            </details>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function ManageAnnouncements() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [list, setList] = useState<AnnouncementList | null>(null);
  const [options, setOptions] = useState<AnnouncementOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ManagedAnnouncement | null | undefined>(undefined);
  const [reportId, setReportId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [nextList, nextOptions] = await Promise.all([listManagedAnnouncements(), getAnnouncementOptions()]);
      setList(nextList);
      setOptions(nextOptions);
    } catch (caught) {
      setLoadError(t(mapAnnouncementError(caught) ?? mapApiError(caught)));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshEverywhere = async () => {
    await load();
    void queryClient.invalidateQueries({ queryKey: announcementQueryKeys.active });
    void queryClient.invalidateQueries({ queryKey: announcementQueryKeys.archive });
  };

  const askPublish = async (item: ManagedAnnouncement) => {
    setActionError(null);
    setPending({ kind: "publish", item, audience: null });
    try {
      const { count } = await previewAnnouncementAudience({
        roles: item.roles,
        organizationalUnitIds: item.organizationalUnitIds,
        groupIds: item.groupIds,
      });
      setPending((previous) => (previous?.kind === "publish" && previous.item.id === item.id ? { ...previous, audience: count } : previous));
    } catch {
      // The count is informative only; publishing still works.
    }
  };

  const confirm = async () => {
    if (pending === null) return;
    setBusy(true);
    setActionError(null);
    try {
      if (pending.kind === "publish") {
        await publishAnnouncement(pending.item.id);
        toast({ tone: "success", title: t("announcements.manage.published") });
      } else if (pending.kind === "withdraw") {
        await withdrawAnnouncement(pending.item.id, reason.trim());
        toast({ tone: "success", title: t("announcements.manage.withdrawn") });
      } else {
        await deleteAnnouncement(pending.item.id);
        toast({ tone: "success", title: t("announcements.manage.deleted") });
      }
      setPending(null);
      setReason("");
      await refreshEverywhere();
    } catch (caught) {
      setActionError(t(mapAnnouncementError(caught) ?? mapApiError(caught)));
    } finally {
      setBusy(false);
    }
  };

  const formatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  if (loadError) {
    return (
      <p role="alert" className={errorTextClassName}>
        {loadError}
      </p>
    );
  }
  if (list === null || options === null) return <PanelSkeleton label={t("ui.loading")} />;

  return (
    <Card>
      <CardHeader
        title={t("announcements.manage.title")}
        subtitle={list.scopedToUnit ? t("announcements.manage.scopedSubtitle") : t("announcements.manage.subtitle")}
        actions={
          <Button size="sm" onClick={() => setEditing(null)}>
            <Plus aria-hidden />
            {t("announcements.manage.new")}
          </Button>
        }
      />
      {list.announcements.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={<Megaphone size={18} />} title={t("announcements.manage.emptyTitle")} body={t("announcements.manage.emptyBody")} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[12.5px]">
            <caption className="sr-only">{t("announcements.manage.title")}</caption>
            <thead className="text-[11.5px] text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-2 font-medium">{t("announcements.manage.columns.title")}</th>
                <th scope="col" className="px-2 py-2 font-medium">{t("announcements.manage.columns.status")}</th>
                <th scope="col" className="px-2 py-2 font-medium">{t("announcements.manage.columns.period")}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{t("announcements.manage.columns.acknowledged")}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{t("announcements.manage.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {list.announcements.map((item) => {
                const editable = item.status === "DRAFT" || item.effectiveStatus === "PUBLISHED" || item.effectiveStatus === "SCHEDULED";
                return (
                  <tr key={item.id} className="border-b border-border/60 align-top">
                    <th scope="row" className="px-4 py-2.5 font-normal">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={severityTone(item.severity)}>{t(severityKeys[item.severity])}</Badge>
                        <span className="font-semibold text-foreground">{item.title}</span>
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                        {item.requiresAcknowledgement
                          ? item.displayMode === "MODAL"
                            ? t("announcements.manage.modeModal")
                            : t("announcements.manage.modeAcknowledge")
                          : t("announcements.manage.modeBanner")}
                        {item.version > 1 ? ` · ${t("announcements.manage.version", { version: item.version })}` : ""}
                      </span>
                    </th>
                    <td className="px-2 py-2.5">
                      <Badge tone={statusTone(item.effectiveStatus)}>{t(statusKeys[item.effectiveStatus])}</Badge>
                    </td>
                    <td className="px-2 py-2.5 text-[12px] text-muted-foreground">
                      {formatter.format(new Date(item.startsAt))}
                      <br />
                      {formatter.format(new Date(item.endsAt))}
                    </td>
                    <td className="tnum px-2 py-2.5 text-right">
                      {item.status === "DRAFT" || !item.requiresAcknowledgement
                        ? "—"
                        : `${item.acknowledgedCount ?? 0} / ${item.audienceSizeAtPublish ?? 0}`}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap justify-end gap-1">
                        {editable ? (
                          <Button variant="ghost" size="xs" onClick={() => setEditing(item)}>
                            <Pencil aria-hidden />
                            {t("announcements.manage.edit")}
                          </Button>
                        ) : null}
                        {item.status === "DRAFT" ? (
                          <>
                            <Button variant="ghost" size="xs" onClick={() => void askPublish(item)}>
                              <Send aria-hidden />
                              {t("announcements.manage.publish")}
                            </Button>
                            <Button variant="ghost" size="xs" onClick={() => setPending({ kind: "delete", item })}>
                              <Trash2 aria-hidden />
                              {t("announcements.manage.delete")}
                            </Button>
                          </>
                        ) : (
                          <Button variant="ghost" size="xs" onClick={() => setReportId(item.id)}>
                            <BarChart3 aria-hidden />
                            {t("announcements.manage.report")}
                          </Button>
                        )}
                        {item.status === "PUBLISHED" && item.effectiveStatus !== "ENDED" ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              setReason("");
                              setActionError(null);
                              setPending({ kind: "withdraw", item });
                            }}
                          >
                            <Undo2 aria-hidden />
                            {t("announcements.manage.withdraw")}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AnnouncementEditorDialog
        open={editing !== undefined}
        onOpenChange={(open) => (open ? undefined : setEditing(undefined))}
        options={options}
        announcement={editing ?? null}
        onSaved={() => {
          setEditing(undefined);
          toast({ tone: "success", title: t("announcements.manage.saved") });
          void refreshEverywhere();
        }}
      />
      <AnnouncementReportDialog announcementId={reportId} onOpenChange={(open) => (open ? undefined : setReportId(null))} />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => (open ? undefined : setPending(null))}
        title={
          pending?.kind === "publish"
            ? t("announcements.manage.publishTitle")
            : pending?.kind === "withdraw"
              ? t("announcements.manage.withdrawTitle")
              : t("announcements.manage.deleteTitle")
        }
        description={
          pending?.kind === "publish"
            ? pending.audience === null
              ? t("announcements.manage.publishBodyUnknown")
              : t("announcements.manage.publishBody", { count: pending.audience })
            : pending?.kind === "withdraw"
              ? t("announcements.manage.withdrawBody")
              : t("announcements.manage.deleteBody")
        }
        confirmLabel={
          pending?.kind === "publish"
            ? t("announcements.manage.publish")
            : pending?.kind === "withdraw"
              ? t("announcements.manage.withdraw")
              : t("announcements.manage.delete")
        }
        intent={pending?.kind === "publish" ? "default" : "danger"}
        isPending={busy || (pending?.kind === "withdraw" && reason.trim().length < 3)}
        onConfirm={() => void confirm()}
      >
        <div className="grid gap-2">
          {pending?.kind === "withdraw" ? (
            <Field label={t("announcements.manage.reason")} required hint={t("announcements.manage.reasonHint")}>
              <Textarea rows={2} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
            </Field>
          ) : null}
          {actionError ? (
            <p role="alert" className={errorTextClassName}>
              {actionError}
            </p>
          ) : null}
        </div>
      </ConfirmDialog>
    </Card>
  );
}

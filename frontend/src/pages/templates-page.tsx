import { ClipboardList, FileText, Pencil, Plus, Search, Trash2, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { AdminConfigChangedBanner } from "@/components/admin/admin-config-changed-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  controlCompactClassName,
  selectCompactClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { RelativeTime } from "@/components/ui/relative-time";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs, type UnderlineTabItem } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/i18n/use-locale";
import { useAdminConfigLiveRefresh } from "@/lib/realtime/use-admin-config-live-refresh";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { mapTemplatesError, type TemplatesErrorKey } from "@/lib/templates/map-templates-error";
import { cn } from "@/lib/utils";
import {
  deletePlaybook,
  deleteResponseTemplate,
  listManagedTemplates,
  listPlaybooks,
  type Playbook,
  type ResponseTemplate,
  type TemplateListState,
} from "@/services/templates-api";

type TabKey = "shared" | "playbooks" | "mine";

type DeleteTarget =
  | { readonly type: "template"; readonly item: ResponseTemplate }
  | { readonly type: "playbook"; readonly item: Playbook };

/**
 * Paket 1.4 (A1): shared templates, playbooks and the agent's personal
 * templates. Editing happens on a dedicated page with a live preview.
 */
export function TemplatesPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { toast } = useToast();
  const { session, hasPermission } = useSessionCapabilities();
  const isSuperAdmin = session?.isSuperAdmin === true;
  const canManage = isSuperAdmin || hasPermission(permissionKeys.ticketTemplatesManage);
  const canPersonal = isSuperAdmin || hasPermission(permissionKeys.ticketTemplatesPersonal);
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = useMemo(() => {
    const items: UnderlineTabItem[] = [];
    if (canManage) items.push({ key: "shared", label: t("templates.tabs.shared") });
    if (canManage) items.push({ key: "playbooks", label: t("templates.tabs.playbooks") });
    if (canPersonal) items.push({ key: "mine", label: t("templates.tabs.mine") });
    return items;
  }, [canManage, canPersonal, t]);

  const requested = searchParams.get("tab");
  const tab: TabKey | null =
    tabs.find((item) => item.key === requested)?.key as TabKey | undefined ??
    (tabs[0]?.key as TabKey | undefined) ??
    null;

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [state, setState] = useState<TemplateListState>("all");
  const [templates, setTemplates] = useState<readonly ResponseTemplate[] | null>(null);
  const [playbooks, setPlaybooks] = useState<readonly Playbook[] | null>(null);
  const [errorKey, setErrorKey] = useState<TemplatesErrorKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    if (tab === null) return;
    try {
      if (tab === "playbooks") {
        setPlaybooks(await listPlaybooks({ q: debounced, state }));
      } else {
        setTemplates(
          await listManagedTemplates({ ownership: tab === "mine" ? "mine" : "shared", q: debounced, state }),
        );
      }
      setErrorKey(null);
    } catch (error) {
      setErrorKey(mapTemplatesError(error));
    }
  }, [debounced, state, tab]);

  useEffect(() => {
    setTemplates(null);
    setPlaybooks(null);
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const live = useAdminConfigLiveRefresh({ domains: ["templates"], reload: load, containerRef });

  const confirmDelete = async () => {
    if (deleteTarget === null) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "playbook") {
        await deletePlaybook(deleteTarget.item.id, reason.trim());
        toast({ tone: "success", title: t("templates.playbook.deleted") });
      } else {
        await deleteResponseTemplate(deleteTarget.item.ownership, deleteTarget.item.id, reason.trim());
        toast({ tone: "success", title: t("templates.editor.deleted") });
      }
      setDeleteTarget(null);
      setReason("");
      await load();
    } catch (error) {
      toast({ tone: "danger", title: t(mapTemplatesError(error)) });
    } finally {
      setDeleting(false);
    }
  };

  const needsReason = deleteTarget !== null && !(deleteTarget.type === "template" && deleteTarget.item.ownership === "personal");

  const newAction =
    tab === "playbooks" ? (
      <Button asChild size="sm">
        <Link to="/admin/templates/playbooks/new" data-testid="templates-new-playbook">
          <Plus size={14} /> {t("templates.actions.newPlaybook")}
        </Link>
      </Button>
    ) : tab === "shared" ? (
      <Button asChild size="sm">
        <Link to="/admin/templates/new?ownership=shared" data-testid="templates-new-shared">
          <Plus size={14} /> {t("templates.actions.newShared")}
        </Link>
      </Button>
    ) : tab === "mine" ? (
      <Button asChild size="sm">
        <Link to="/admin/templates/new?ownership=personal" data-testid="templates-new-personal">
          <Plus size={14} /> {t("templates.actions.newPersonal")}
        </Link>
      </Button>
    ) : null;

  const rows = tab === "playbooks" ? playbooks : templates;

  return (
    <section ref={containerRef}>
      <PageHeader
        crumbs={["EP-HelpDesk", t("navigation.sections.tickets"), t("templates.title")]}
        title={t("templates.title")}
        subtitle={t("templates.intro")}
        actions={newAction}
      />
      <AdminConfigChangedBanner pending={live.pending} onRefresh={live.refreshNow} onDismiss={live.dismiss} />
      {tab === null ? (
        <EmptyState icon={<FileText size={18} />} title={t("templates.errors.FORBIDDEN")} />
      ) : (
        <>
          <UnderlineTabs
            items={tabs}
            active={tab}
            onChange={(key) => {
              setSearchParams({ tab: key }, { replace: true });
              setQuery("");
            }}
            className="mb-3"
          />
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("templates.list.search")}
                aria-label={t("templates.list.search")}
                className={cn(controlCompactClassName, "pl-7")}
              />
            </div>
            <select
              value={state}
              onChange={(event) => setState(event.target.value as TemplateListState)}
              aria-label={t("templates.list.state")}
              className={cn(selectCompactClassName, "w-auto")}
            >
              <option value="all">{t("templates.list.stateAll")}</option>
              <option value="active">{t("templates.list.stateActive")}</option>
              <option value="inactive">{t("templates.list.stateInactive")}</option>
            </select>
          </div>
          {errorKey !== null ? (
            <p role="alert" className="mb-3 text-[12.5px] text-danger">
              {t(errorKey)}
            </p>
          ) : null}
          {rows === null && errorKey === null ? (
            <PanelSkeleton label={t("templates.title")} />
          ) : rows !== null && rows.length === 0 ? (
            <EmptyState
              icon={tab === "playbooks" ? <ClipboardList size={18} /> : <FileText size={18} />}
              title={
                debounced.length > 0 || state !== "all"
                  ? t("templates.list.emptyFiltered")
                  : tab === "playbooks"
                    ? t("templates.list.emptyPlaybooks")
                    : tab === "mine"
                      ? t("templates.list.emptyMine")
                      : t("templates.list.emptyShared")
              }
              action={newAction ?? undefined}
            />
          ) : tab === "playbooks" && playbooks !== null ? (
            <PlaybookTable items={playbooks} locale={locale} onDelete={(item) => setDeleteTarget({ type: "playbook", item })} />
          ) : templates !== null ? (
            <TemplateTable
              items={templates}
              locale={locale}
              onDelete={(item) => setDeleteTarget({ type: "template", item })}
            />
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setReason("");
          }
        }}
        title={deleteTarget?.type === "playbook" ? t("templates.playbook.deleteTitle") : t("templates.editor.deleteTitle")}
        description={deleteTarget?.type === "playbook" ? t("templates.playbook.deleteBody") : t("templates.editor.deleteBody")}
        intent="danger"
        confirmLabel={t("templates.actions.delete")}
        isPending={deleting || (needsReason && reason.trim().length < 3)}
        onConfirm={() => void confirmDelete()}
      >
        {needsReason ? (
          <Field label={t("templates.editor.reason")} required hint={t("templates.editor.reasonHint")}>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} />
          </Field>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}

function ScopeCell({
  serviceIds,
  categoryIds,
  groupIds = [],
}: {
  readonly serviceIds: readonly string[];
  readonly categoryIds: readonly string[];
  readonly groupIds?: readonly string[];
}) {
  const { t } = useTranslation();
  if (serviceIds.length + categoryIds.length + groupIds.length === 0) {
    return <Badge tone="info">{t("templates.list.global")}</Badge>;
  }
  return (
    <span className="text-[11.5px] text-muted-foreground">
      {t("templates.list.scopeSummary", {
        services: serviceIds.length,
        categories: categoryIds.length,
        groups: groupIds.length,
      })}
    </span>
  );
}

function TemplateTable({
  items,
  locale,
  onDelete,
}: {
  readonly items: readonly ResponseTemplate[];
  readonly locale: string;
  readonly onDelete: (item: ResponseTemplate) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={tableWrapClassName}>
      <table className="w-full text-left text-[12.5px]" data-testid="templates-table">
        <thead className={tableHeadClassName}>
          <tr className="border-b border-border/70 [&>th]:px-3 [&>th]:py-2">
            <th>{t("templates.list.name")}</th>
            <th>{t("templates.list.kind")}</th>
            <th>{t("templates.list.scope")}</th>
            <th className="text-right">{t("templates.list.usage")}</th>
            <th>{t("templates.list.updated")}</th>
            <th>{t("templates.list.state")}</th>
            <th className="sr-only">{t("templates.actions.edit")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={cn(tableRowClassName, "[&>td]:px-3")}>
              <td className="max-w-[320px]">
                <Link to={`/admin/templates/${item.id}`} className="flex items-center gap-1.5 font-medium text-foreground hover:text-link">
                  {item.ownership === "personal" ? <User size={12} /> : <FileText size={12} />}
                  <span className="truncate">{item.name}</span>
                </Link>
                {item.tags.length > 0 ? (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {item.tags.map((tag) => `#${tag}`).join(" ")}
                  </p>
                ) : null}
              </td>
              <td>{t(`templates.kind.${item.kind}`)}</td>
              <td>
                {item.ownership === "personal" ? (
                  <Badge>{t("templates.picker.personal")}</Badge>
                ) : (
                  <ScopeCell serviceIds={item.serviceIds} categoryIds={item.categoryIds} groupIds={item.groupIds} />
                )}
              </td>
              <td className="tnum text-right">{t("templates.list.usageCount", { count: item.usageCount })}</td>
              <td className="text-muted-foreground">
                <RelativeTime value={item.updatedAt} locale={locale} />
              </td>
              <td>
                <Badge tone={item.isActive ? "success" : "neutral"} dot>
                  {item.isActive ? t("templates.state.active") : t("templates.state.inactive")}
                </Badge>
              </td>
              <td className="whitespace-nowrap text-right">
                <RowActions
                  editTo={`/admin/templates/${item.id}`}
                  canEdit={item.canEdit}
                  onDelete={() => onDelete(item)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlaybookTable({
  items,
  locale,
  onDelete,
}: {
  readonly items: readonly Playbook[];
  readonly locale: string;
  readonly onDelete: (item: Playbook) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={tableWrapClassName}>
      <table className="w-full text-left text-[12.5px]" data-testid="playbooks-table">
        <thead className={tableHeadClassName}>
          <tr className="border-b border-border/70 [&>th]:px-3 [&>th]:py-2">
            <th>{t("templates.list.name")}</th>
            <th>{t("templates.list.scope")}</th>
            <th className="text-right">{t("templates.list.steps")}</th>
            <th className="text-right">{t("templates.list.tickets")}</th>
            <th className="text-right">{t("templates.list.version")}</th>
            <th>{t("templates.list.updated")}</th>
            <th>{t("templates.list.state")}</th>
            <th className="sr-only">{t("templates.actions.edit")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={cn(tableRowClassName, "[&>td]:px-3")}>
              <td className="max-w-[320px]">
                <Link
                  to={`/admin/templates/playbooks/${item.id}`}
                  className="flex items-center gap-1.5 font-medium text-foreground hover:text-link"
                >
                  <ClipboardList size={12} />
                  <span className="truncate">{item.name}</span>
                </Link>
                {item.description ? (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.description}</p>
                ) : null}
              </td>
              <td>
                <ScopeCell serviceIds={item.serviceIds} categoryIds={item.categoryIds} />
              </td>
              <td className="tnum text-right">
                {item.steps.length}
                {item.steps.some((step) => step.required) ? (
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    ({item.steps.filter((step) => step.required).length} {t("templates.checklist.requiredBadge").toLocaleLowerCase()})
                  </span>
                ) : null}
              </td>
              <td className="tnum text-right">{item.activeTicketCount}</td>
              <td className="tnum text-right">v{item.version}</td>
              <td className="text-muted-foreground">
                <RelativeTime value={item.updatedAt} locale={locale} />
              </td>
              <td>
                <Badge tone={item.isActive ? "success" : "neutral"} dot>
                  {item.isActive ? t("templates.state.active") : t("templates.state.inactive")}
                </Badge>
              </td>
              <td className="whitespace-nowrap text-right">
                <RowActions
                  editTo={`/admin/templates/playbooks/${item.id}`}
                  canEdit={item.canEdit}
                  onDelete={() => onDelete(item)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({
  editTo,
  canEdit,
  onDelete,
}: {
  readonly editTo: string;
  readonly canEdit: boolean;
  readonly onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center gap-1">
      <Button asChild variant="ghost" size="xs">
        <Link to={editTo}>
          <Pencil size={12} /> {canEdit ? t("templates.actions.edit") : t("templates.actions.view")}
        </Link>
      </Button>
      {canEdit ? (
        <Button type="button" variant="ghost" size="xs" onClick={onDelete} aria-label={t("templates.actions.delete")}>
          <Trash2 size={12} />
        </Button>
      ) : null}
    </div>
  );
}

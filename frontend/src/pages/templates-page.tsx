import { ClipboardList, FileText, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { AdminConfigChangedBanner } from "@/components/admin/admin-config-changed-banner";
import { PlaybookTable, TemplateTable } from "@/components/templates/template-management-tables";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { controlCompactClassName, selectCompactClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/field";
import { PageHeader, brandCrumb } from "@/components/layout/page-header";
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
  type CountedCursorPage,
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
    (tabs.find((item) => item.key === requested)?.key as TabKey | undefined) ??
    (tabs[0]?.key as TabKey | undefined) ??
    null;

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [state, setState] = useState<TemplateListState>("all");
  const [templates, setTemplates] = useState<CountedCursorPage<ResponseTemplate> | null>(null);
  const [playbooks, setPlaybooks] = useState<CountedCursorPage<Playbook> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorKey, setErrorKey] = useState<TemplatesErrorKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const containerRef = useRef<HTMLElement>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (cursor?: string) => {
      if (tab === null) return;
      const version = requestVersion.current;
      try {
        if (tab === "playbooks") {
          const page = await listPlaybooks({ q: debounced, state, cursor });
          if (version !== requestVersion.current) return;
          setPlaybooks((current) =>
            cursor !== undefined && current !== null
              ? { ...page, items: [...current.items, ...page.items] }
              : page,
          );
        } else {
          const page = await listManagedTemplates({
            ownership: tab === "mine" ? "mine" : "shared",
            q: debounced,
            state,
            cursor,
          });
          if (version !== requestVersion.current) return;
          setTemplates((current) =>
            cursor !== undefined && current !== null
              ? { ...page, items: [...current.items, ...page.items] }
              : page,
          );
        }
        if (version === requestVersion.current) setErrorKey(null);
      } catch (error) {
        if (version === requestVersion.current) setErrorKey(mapTemplatesError(error));
      }
    },
    [debounced, state, tab],
  );

  useEffect(() => {
    requestVersion.current += 1;
    setTemplates(null);
    setPlaybooks(null);
  }, [tab, debounced, state]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    const cursor = tab === "playbooks" ? playbooks?.nextCursor : templates?.nextCursor;
    if (cursor === null || cursor === undefined || loadingMore) return;
    setLoadingMore(true);
    try {
      await load(cursor);
    } finally {
      setLoadingMore(false);
    }
  }, [load, loadingMore, playbooks, tab, templates]);

  const live = useAdminConfigLiveRefresh({ domains: ["templates"], reload: load, containerRef });

  const confirmDelete = async () => {
    if (deleteTarget === null) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "playbook") {
        await deletePlaybook(deleteTarget.item.id, {
          reason: reason.trim(),
          expectedUpdatedAt: deleteTarget.item.updatedAt,
        });
        toast({ tone: "success", title: t("templates.playbook.deleted") });
      } else {
        await deleteResponseTemplate(deleteTarget.item.ownership, deleteTarget.item.id, {
          reason: reason.trim(),
          expectedUpdatedAt: deleteTarget.item.updatedAt,
        });
        toast({ tone: "success", title: t("templates.editor.deleted") });
      }
      setDeleteTarget(null);
      setReason("");
      await load();
    } catch (error) {
      const mapped = mapTemplatesError(error);
      toast({ tone: "danger", title: t(mapped), error: error });
      if (
        mapped === "templates.errors.TEMPLATE_VERSION_CONFLICT" ||
        mapped === "templates.errors.PLAYBOOK_VERSION_CONFLICT"
      ) {
        setDeleteTarget(null);
        setReason("");
        await load();
      }
    } finally {
      setDeleting(false);
    }
  };

  const needsReason =
    deleteTarget !== null &&
    !(deleteTarget.type === "template" && deleteTarget.item.ownership === "personal");

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

  const page = tab === "playbooks" ? playbooks : templates;
  const rows = page?.items ?? null;

  return (
    <section ref={containerRef}>
      <PageHeader
        crumbs={[brandCrumb, t("navigation.sections.tickets"), t("templates.title")]}
        title={t("templates.title")}
        subtitle={t("templates.intro")}
        actions={newAction}
      />
      <AdminConfigChangedBanner
        pending={live.pending}
        onRefresh={live.refreshNow}
        onDismiss={live.dismiss}
      />
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
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
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
            <PlaybookTable
              items={playbooks.items}
              locale={locale}
              onDelete={(item) => setDeleteTarget({ type: "playbook", item })}
            />
          ) : templates !== null ? (
            <TemplateTable
              items={templates.items}
              locale={locale}
              onDelete={(item) => setDeleteTarget({ type: "template", item })}
            />
          ) : null}
          {page !== null && page.total > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
              <span>
                {t("templates.list.showingCount", { shown: rows?.length ?? 0, total: page.total })}
              </span>
              {page.hasMore ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? t("templates.list.loadingMore") : t("templates.list.loadMore")}
                </Button>
              ) : null}
            </div>
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
        title={
          deleteTarget?.type === "playbook"
            ? t("templates.playbook.deleteTitle")
            : t("templates.editor.deleteTitle")
        }
        description={
          deleteTarget?.type === "playbook"
            ? t("templates.playbook.deleteBody")
            : t("templates.editor.deleteBody")
        }
        intent="danger"
        confirmLabel={t("templates.actions.delete")}
        isPending={deleting || (needsReason && reason.trim().length < 3)}
        onConfirm={() => void confirmDelete()}
      >
        {needsReason ? (
          <Field
            label={t("templates.editor.reason")}
            required
            hint={t("templates.editor.reasonHint")}
          >
            {(control) => (
              <Textarea
                {...control}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={500}
              />
            )}
          </Field>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Trash2,
} from "lucide-react";
import { OnCallCalendar } from "@/components/on-call/on-call-calendar";
import { OnCallRangeDialog, type OnCallRangeMode } from "@/components/on-call/on-call-range-dialog";
import { OnCallReasonDialog } from "@/components/on-call/on-call-reason-dialog";
import { OnCallScheduleDialog } from "@/components/on-call/on-call-schedule-dialog";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { createOperationGuard } from "@/lib/async/operation-guard";
import { mapApiError } from "@/lib/map-api-error";
import { parseOnCallPageSearch, updateOnCallPageSearch } from "@/lib/on-call/on-call-page-search";
import { useOnCallGroupDetail } from "@/lib/on-call/use-on-call-group-detail";
import { useOnCallOverviewData } from "@/lib/on-call/use-on-call-overview-data";
import {
  formatOnCallTime,
  onCallSwapStatusKey,
  groupSegmentsByDay,
  mapOnCallError,
  startOfWeek,
} from "@/lib/on-call/on-call-view";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { cn } from "@/lib/utils";
import {
  decideOnCallSwap,
  deleteOnCallOverride,
  deleteOnCallSchedule,
  type OnCallSwapView,
} from "@/services/on-call-api";

const calendarDays = 28;
const dayMs = 86_400_000;

type PendingDelete =
  { readonly kind: "schedule" } | { readonly kind: "override"; readonly id: string };

/**
 * Paket 2.9 (K3, §4.4): who is on call, the four-week calendar, overrides and
 * swap requests. Everyone with `oncall.read` sees every schedule; managers
 * (`oncall.manage`) edit rotations and overrides.
 */
export function OnCallPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { session } = useSessionCapabilities();
  const currentUserId = session?.principal.subjectId ?? null;

  const {
    overview,
    me,
    swaps,
    overviewError,
    meError,
    swapsError,
    pending,
    refreshing,
    reloadAll: reloadOverviewData,
    reloadOverview,
    reloadMe,
    reloadSwaps,
  } = useOnCallOverviewData();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageSearch = parseOnCallPageSearch(searchParams);
  const requestedGroup = overview?.groups.find((group) => group.groupId === pageSearch.groupId);
  const selectedGroupId =
    requestedGroup?.groupId ??
    overview?.groups.find((group) => group.hasSchedule)?.groupId ??
    overview?.groups[0]?.groupId ??
    null;
  const weekOffset = pageSearch.weekOffset;
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [rangeMode, setRangeMode] = useState<OnCallRangeMode | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const operationGuard = useRef(createOperationGuard());

  useEffect(() => {
    if (overview === null || selectedGroupId === null) return;
    const canonical = updateOnCallPageSearch(searchParams, {
      groupId: selectedGroupId,
      weekOffset,
    });
    if (canonical.toString() === searchParams.toString()) return;
    setSearchParams(canonical, { replace: true });
  }, [overview, searchParams, selectedGroupId, setSearchParams, weekOffset]);

  const selectedOverviewGroup = overview?.groups.find((group) => group.groupId === selectedGroupId);
  const timeZone =
    selectedOverviewGroup?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rangeStart = useMemo(
    () => new Date(startOfWeek(new Date(), timeZone).getTime() + weekOffset * 7 * dayMs),
    [timeZone, weekOffset],
  );
  const detailRange = useMemo(
    () => ({
      from: new Date(rangeStart.getTime() - dayMs).toISOString(),
      to: new Date(rangeStart.getTime() + (calendarDays + 1) * dayMs).toISOString(),
    }),
    [rangeStart],
  );
  const {
    detail,
    error: detailError,
    loading: detailLoading,
    retry: retryDetail,
  } = useOnCallGroupDetail(selectedGroupId, detailRange);

  const selectGroup = (groupId: string) => {
    setSearchParams((current) => updateOnCallPageSearch(current, { groupId, weekOffset: 0 }));
  };

  const reloadAll = () => {
    reloadOverviewData();
    retryDetail();
  };

  const days = useMemo(
    () =>
      detail === null
        ? []
        : groupSegmentsByDay(detail.segments, rangeStart, calendarDays, timeZone),
    [detail, rangeStart, timeZone],
  );

  const decide = async (swap: OnCallSwapView, decision: "accept" | "decline" | "cancel") => {
    await operationGuard.current.run(`swap:${swap.id}`, async () => {
      setBusy(swap.id);
      try {
        await decideOnCallSwap(swap.id, decision);
        toast({
          tone: "success",
          title:
            decision === "accept"
              ? t("onCall.swaps.accepted")
              : decision === "decline"
                ? t("onCall.swaps.declined")
                : t("onCall.swaps.cancelled"),
        });
        reloadAll();
      } catch (caught) {
        toast({
          tone: "danger",
          title: t(mapOnCallError(caught) ?? mapApiError(caught)),
          error: caught,
        });
      } finally {
        setBusy(null);
      }
    });
  };

  const confirmDelete = async (reason: string) => {
    if (pendingDelete === null || detail === null) return;
    const operation = pendingDelete;
    const groupId = detail.group.id;
    const key = operation.kind === "schedule" ? `schedule:${groupId}` : `override:${operation.id}`;
    await operationGuard.current.run(key, async () => {
      setBusy("delete");
      setDeleteError(null);
      try {
        if (operation.kind === "schedule") {
          await deleteOnCallSchedule(groupId, reason);
          toast({ tone: "success", title: t("onCall.schedule.deleted") });
        } else {
          await deleteOnCallOverride(operation.id, reason);
          toast({ tone: "success", title: t("onCall.override.deleted") });
        }
        setPendingDelete(null);
        reloadAll();
      } catch (caught) {
        setDeleteError(t(mapOnCallError(caught) ?? mapApiError(caught)));
      } finally {
        setBusy(null);
      }
    });
  };

  const header = (
    <PageHeader
      crumbs={[t("navigation.sections.tickets"), t("onCall.title")]}
      title={t("onCall.title")}
      subtitle={t("onCall.subtitle")}
      actions={
        <Button variant="outline" size="sm" onClick={reloadAll} disabled={refreshing}>
          <RefreshCw className={cn(refreshing && "animate-spin")} />
          {t("onCall.refresh")}
        </Button>
      }
    />
  );

  if (overview === null) {
    return (
      <div className="page-in">
        {header}
        {overviewError === null ? (
          <PanelSkeleton label={t("onCall.loading")} />
        ) : overviewError.disabled ? (
          <EmptyState
            icon={<CalendarClock size={18} />}
            title={t("onCall.disabledTitle")}
            body={t("onCall.disabledBody")}
          />
        ) : (
          <div className="grid gap-2">
            <ApiErrorText messageKey={overviewError.key} requestId={overviewError.requestId} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reloadOverview()}
              disabled={pending.overview}
            >
              {t("ui.retry")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  const schedule = detail?.schedule ?? null;
  const isRotationMember =
    schedule?.members.some((member) => member.userId === currentUserId) ?? false;
  const colleagues = (schedule?.members ?? [])
    .filter((member) => member.userId !== currentUserId && member.isAvailable)
    .map((member) => ({ userId: member.userId, displayName: member.displayName }));
  const pendingSwaps = swaps.filter((swap) => swap.status === "PENDING");
  const recentSwaps = swaps.filter((swap) => swap.status !== "PENDING").slice(0, 10);
  const dateOnly = new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "bs-BA", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const rangeLabel = `${dateOnly.format(rangeStart)} – ${dateOnly.format(new Date(rangeStart.getTime() + (calendarDays - 1) * dayMs + dayMs / 2))}`;

  return (
    <div className="page-in grid gap-4">
      {header}
      {overviewError === null ? null : (
        <ApiErrorText messageKey={overviewError.key} requestId={overviewError.requestId} />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("onCall.mine.title")} subtitle={t("onCall.mine.subtitle")} />
          <div className="grid gap-2 px-4 py-3.5 text-[12.5px]">
            {meError === null ? null : (
              <div className="grid gap-2">
                <ApiErrorText messageKey={meError.key} requestId={meError.requestId} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void reloadMe()}
                  disabled={pending.me}
                >
                  {t("ui.retry")}
                </Button>
              </div>
            )}
            {me === null && pending.me ? (
              <p role="status" className={hintClassName}>
                {t("onCall.loading")}
              </p>
            ) : me === null || (me.current.length === 0 && me.next === null) ? (
              <p className={hintClassName}>{t("onCall.mine.none")}</p>
            ) : null}
            {me?.current.map((shift) => (
              <p key={shift.groupId} className="flex flex-wrap items-center gap-2">
                <Badge tone="success" dot>
                  {t("onCall.mine.now")}
                </Badge>
                <span className="font-medium text-foreground">{shift.groupName}</span>
                <span className={hintClassName}>
                  {t("onCall.until", { time: formatOnCallTime(shift.endsAt, t, shift.timezone) })}
                </span>
              </p>
            ))}
            {me?.next ? (
              <p className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{t("onCall.mine.next")}</Badge>
                <span className="font-medium text-foreground">{me.next.groupName}</span>
                <span className={hintClassName}>
                  {formatOnCallTime(me.next.startsAt, t, me.next.timezone)} –{" "}
                  {formatOnCallTime(me.next.endsAt, t, me.next.timezone)}
                </span>
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title={t("onCall.swaps.title")} subtitle={t("onCall.swaps.subtitle")} />
          <div className="grid gap-2 px-4 py-3.5">
            {swapsError === null ? null : (
              <div className="grid gap-2">
                <ApiErrorText messageKey={swapsError.key} requestId={swapsError.requestId} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void reloadSwaps()}
                  disabled={pending.swaps}
                >
                  {t("ui.retry")}
                </Button>
              </div>
            )}
            {pending.swaps && swaps.length === 0 ? (
              <p role="status" className={hintClassName}>
                {t("onCall.loading")}
              </p>
            ) : pendingSwaps.length === 0 ? (
              <p className={hintClassName}>{t("onCall.swaps.none")}</p>
            ) : null}
            <ul className="grid gap-2">
              {pendingSwaps.map((swap) => (
                <li
                  key={swap.id}
                  className="grid gap-1.5 rounded-md border border-border/70 bg-background/40 px-3 py-2 text-[12.5px]"
                  data-testid="on-call-swap"
                >
                  <p className="text-foreground">
                    {swap.direction === "incoming"
                      ? t("onCall.swaps.incoming", {
                          name: swap.requester.displayName,
                          group: swap.groupName,
                        })
                      : t("onCall.swaps.outgoing", {
                          name: swap.colleague.displayName,
                          group: swap.groupName,
                        })}
                  </p>
                  <p className={hintClassName}>
                    {formatOnCallTime(swap.startsAt, t, swap.timezone)} –{" "}
                    {formatOnCallTime(swap.endsAt, t, swap.timezone)} · {swap.reason}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {swap.direction === "incoming" ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => void decide(swap, "accept")}
                          disabled={busy === swap.id}
                        >
                          {t("onCall.swaps.accept")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void decide(swap, "decline")}
                          disabled={busy === swap.id}
                        >
                          {t("onCall.swaps.decline")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void decide(swap, "cancel")}
                        disabled={busy === swap.id}
                      >
                        {t("onCall.swaps.cancel")}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {recentSwaps.length > 0 ? (
              <details className="text-[12px]">
                <summary className="cursor-pointer text-muted-foreground">
                  {t("onCall.swaps.history", { count: recentSwaps.length })}
                </summary>
                <ul className="mt-1.5 grid gap-1">
                  {recentSwaps.map((swap) => (
                    <li key={swap.id} className={hintClassName}>
                      {swap.groupName}: {swap.requester.displayName} → {swap.colleague.displayName}{" "}
                      · {formatOnCallTime(swap.startsAt, t, swap.timezone)} ·{" "}
                      {t(onCallSwapStatusKey(swap.status))}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("onCall.groups.title")} subtitle={t("onCall.groups.subtitle")} />
        {overview.groups.length === 0 ? (
          <div className="px-4 py-4">
            <p className={hintClassName}>
              {overview.canManage ? t("onCall.groups.noneManager") : t("onCall.groups.none")}
            </p>
          </div>
        ) : (
          <ul className="grid gap-1.5 px-4 py-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {overview.groups.map((group) => (
              <li key={group.groupId}>
                <button
                  type="button"
                  aria-pressed={group.groupId === selectedGroupId}
                  onClick={() => selectGroup(group.groupId)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-[12.5px] transition-colors",
                    group.groupId === selectedGroupId
                      ? "border-primary/50 bg-primary/8"
                      : "border-border/70 bg-background/40 hover:bg-surface-hover",
                  )}
                  data-testid="on-call-group"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">
                      {group.groupName}
                    </span>
                    <span className={cn("block truncate", hintClassName)}>
                      {!group.hasSchedule
                        ? t("onCall.groups.noSchedule")
                        : !group.isActive
                          ? t("onCall.groups.inactive")
                          : group.current === null
                            ? t("onCall.nobody")
                            : t("onCall.groups.current", {
                                name: group.current.displayName,
                                time: formatOnCallTime(
                                  group.current.endsAt,
                                  t,
                                  group.timezone ?? undefined,
                                ),
                              })}
                    </span>
                  </span>
                  {group.hasSchedule && group.isActive && group.current === null ? (
                    <Badge tone="warning">{t("onCall.gap")}</Badge>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {selectedGroupId !== null ? (
        <Card>
          <CardHeader
            title={detail?.group.name ?? t("onCall.loading")}
            subtitle={
              schedule === null
                ? t("onCall.detail.noSchedule")
                : t("onCall.detail.summary", {
                    length:
                      schedule.rotationLength === "WEEK"
                        ? t("onCall.schedule.week")
                        : t("onCall.schedule.day"),
                    time: schedule.handoffTime,
                    zone: schedule.timezone,
                  })
            }
            actions={
              detail === null ? undefined : (
                <div className="flex flex-wrap gap-2">
                  {isRotationMember && colleagues.length > 0 ? (
                    <Button size="sm" variant="outline" onClick={() => setRangeMode("swap")}>
                      <Repeat />
                      {t("onCall.swap.open")}
                    </Button>
                  ) : null}
                  {detail.canManage && schedule !== null ? (
                    <Button size="sm" variant="outline" onClick={() => setRangeMode("override")}>
                      <Plus />
                      {t("onCall.override.open")}
                    </Button>
                  ) : null}
                  {detail.canManage ? (
                    <Button size="sm" onClick={() => setScheduleOpen(true)}>
                      <Pencil />
                      {schedule === null ? t("onCall.schedule.create") : t("onCall.schedule.edit")}
                    </Button>
                  ) : null}
                  {detail.canManage && schedule !== null ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingDelete({ kind: "schedule" })}
                      aria-label={t("onCall.schedule.delete")}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              )
            }
          />
          <div className="grid gap-4 px-4 py-3.5">
            {detailError !== null ? (
              <div className="grid gap-2">
                <ApiErrorText messageKey={detailError.key} requestId={detailError.requestId} />
                <Button variant="outline" size="sm" onClick={retryDetail} disabled={detailLoading}>
                  {t("ui.retry")}
                </Button>
              </div>
            ) : null}
            {detail === null && detailError === null ? (
              <PanelSkeleton label={t("onCall.loading")} />
            ) : null}
            {detail !== null && schedule !== null ? (
              <>
                <div
                  role="status"
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-[12.5px]",
                    detail.current?.person
                      ? "border-success/30 bg-success/10 text-foreground"
                      : "border-warning/30 bg-warning/10 text-warning",
                  )}
                >
                  {!schedule.isActive
                    ? t("onCall.groups.inactive")
                    : detail.current?.person
                      ? t("onCall.detail.current", {
                          name: detail.current.person.displayName,
                          time: formatOnCallTime(detail.current.endsAt, t, timeZone),
                        })
                      : t("onCall.detail.gap")}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12.5px] font-medium text-foreground">{rangeLabel}</p>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSearchParams((current) =>
                          updateOnCallPageSearch(current, { weekOffset: weekOffset - 4 }),
                        )
                      }
                      aria-label={t("onCall.calendar.previous")}
                      disabled={weekOffset <= -52}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSearchParams((current) =>
                          updateOnCallPageSearch(current, { weekOffset: 0 }),
                        )
                      }
                      disabled={weekOffset === 0}
                    >
                      {t("onCall.calendar.today")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSearchParams((current) =>
                          updateOnCallPageSearch(current, { weekOffset: weekOffset + 4 }),
                        )
                      }
                      aria-label={t("onCall.calendar.next")}
                      disabled={weekOffset >= 52}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
                {detailLoading ? (
                  <p role="status" className={hintClassName}>
                    {t("onCall.loading")}
                  </p>
                ) : null}
                <div
                  aria-busy={detailLoading}
                  className={cn("transition-opacity", detailLoading && "opacity-60")}
                >
                  <OnCallCalendar days={days} timeZone={timeZone} currentUserId={currentUserId} />
                </div>
                <p className={hintClassName}>{t("onCall.calendar.legend", { zone: timeZone })}</p>

                <section aria-labelledby="on-call-rotation" className="grid gap-1.5">
                  <h3 id="on-call-rotation" className="text-[12.5px] font-semibold text-foreground">
                    {t("onCall.schedule.members")}
                  </h3>
                  {schedule.members.length === 0 ? (
                    <p className={hintClassName}>{t("onCall.schedule.noMembers")}</p>
                  ) : (
                    <ol className="flex flex-wrap gap-1.5 text-[12px]">
                      {schedule.members.map((member, index) => (
                        <li
                          key={member.userId}
                          className="rounded border border-border/70 px-2 py-1 text-foreground"
                        >
                          {index + 1}. {member.displayName}
                          {member.isAvailable ? null : (
                            <span className="ml-1 text-warning">({t("onCall.unavailable")})</span>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                  <p className={hintClassName}>
                    {t("onCall.detail.owner", { name: schedule.owner?.displayName ?? "—" })}
                    {schedule.autoAssignOutsideHours ? ` · ${t("onCall.detail.autoAssignOn")}` : ""}
                  </p>
                </section>

                <section aria-labelledby="on-call-overrides" className="grid gap-1.5">
                  <h3
                    id="on-call-overrides"
                    className="text-[12.5px] font-semibold text-foreground"
                  >
                    {t("onCall.override.list")}
                  </h3>
                  {detail.overrides.length === 0 ? (
                    <p className={hintClassName}>{t("onCall.override.none")}</p>
                  ) : (
                    <ul className="grid gap-1.5">
                      {detail.overrides.map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 px-3 py-1.5 text-[12.5px]"
                        >
                          <span className="font-medium text-foreground">
                            {item.person?.displayName ?? "—"}
                          </span>
                          <span className={hintClassName}>
                            {formatOnCallTime(item.startsAt, t, timeZone)} –{" "}
                            {formatOnCallTime(item.endsAt, t, timeZone)}
                          </span>
                          {item.fromSwap ? (
                            <Badge tone="info">{t("onCall.override.fromSwap")}</Badge>
                          ) : null}
                          <span
                            className={cn("min-w-0 flex-1 truncate", hintClassName)}
                            title={item.reason}
                          >
                            {item.reason}
                          </span>
                          {detail.canManage ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={t("onCall.override.delete")}
                              onClick={() => setPendingDelete({ kind: "override", id: item.id })}
                            >
                              <Trash2 />
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {detail.swaps.length > 0 ? (
                  <section aria-labelledby="on-call-group-swaps" className="grid gap-1.5">
                    <h3
                      id="on-call-group-swaps"
                      className="text-[12.5px] font-semibold text-foreground"
                    >
                      {t("onCall.swaps.groupPending")}
                    </h3>
                    <ul className="grid gap-1">
                      {detail.swaps.map((swap) => (
                        <li key={swap.id} className={hintClassName}>
                          {swap.requester?.displayName ?? "—"} →{" "}
                          {swap.colleague?.displayName ?? "—"} ·{" "}
                          {formatOnCallTime(swap.startsAt, t, timeZone)} –{" "}
                          {formatOnCallTime(swap.endsAt, t, timeZone)}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            ) : null}
            {detail !== null && schedule === null ? (
              <EmptyState
                icon={<CalendarClock size={18} />}
                title={t("onCall.detail.noSchedule")}
                body={
                  detail.canManage
                    ? t("onCall.detail.noScheduleManager")
                    : t("onCall.detail.noScheduleReader")
                }
              />
            ) : null}
          </div>
        </Card>
      ) : null}

      {detail !== null && scheduleOpen ? (
        <OnCallScheduleDialog
          open
          onOpenChange={setScheduleOpen}
          detail={detail}
          onSaved={reloadAll}
        />
      ) : null}
      {detail !== null && rangeMode !== null ? (
        <OnCallRangeDialog
          open
          onOpenChange={(open) => (open ? undefined : setRangeMode(null))}
          mode={rangeMode}
          groupId={detail.group.id}
          groupName={detail.group.name}
          timeZone={timeZone}
          people={rangeMode === "override" ? detail.candidates : colleagues}
          onSaved={reloadAll}
        />
      ) : null}
      <OnCallReasonDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
        title={
          pendingDelete?.kind === "schedule"
            ? t("onCall.schedule.deleteTitle")
            : t("onCall.override.deleteTitle")
        }
        description={
          pendingDelete?.kind === "schedule"
            ? t("onCall.schedule.deleteBody")
            : t("onCall.override.deleteBody")
        }
        confirmLabel={t("onCall.delete")}
        error={deleteError}
        isPending={busy === "delete"}
        onConfirm={(reason) => void confirmDelete(reason)}
      />
    </div>
  );
}

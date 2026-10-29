import { OnCallOverviewLoading, OnCallPageHeader } from "@/components/on-call/on-call-page-state";
import { OnCallPageDialogs } from "@/components/on-call/on-call-page-dialogs";
import { OnCallOverviewCards } from "@/components/on-call/on-call-overview-cards";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react";
import { OnCallCalendar } from "@/components/on-call/on-call-calendar";
import type { OnCallRangeMode } from "@/components/on-call/on-call-range-dialog";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { createOperationGuard } from "@/lib/async/operation-guard";
import {
  formatOnCallRange,
  onCallCalendarDays,
  onCallDayMs,
  resolveSelectedOnCallGroupId,
  type OnCallPendingDelete,
} from "@/lib/on-call/on-call-page-model";
import { mapApiError } from "@/lib/map-api-error";
import { parseOnCallPageSearch, updateOnCallPageSearch } from "@/lib/on-call/on-call-page-search";
import { useOnCallGroupDetail } from "@/lib/on-call/use-on-call-group-detail";
import { useOnCallOverviewData } from "@/lib/on-call/use-on-call-overview-data";
import {
  formatOnCallTime,
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

/** On-call schedules, overrides and swaps with capability-gated management. */
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
  const selectedGroupId = resolveSelectedOnCallGroupId(overview, pageSearch.groupId);
  const weekOffset = pageSearch.weekOffset;
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [rangeMode, setRangeMode] = useState<OnCallRangeMode | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OnCallPendingDelete | null>(null);
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
    () => new Date(startOfWeek(new Date(), timeZone).getTime() + weekOffset * 7 * onCallDayMs),
    [timeZone, weekOffset],
  );
  const detailRange = useMemo(
    () => ({
      from: new Date(rangeStart.getTime() - onCallDayMs).toISOString(),
      to: new Date(rangeStart.getTime() + (onCallCalendarDays + 1) * onCallDayMs).toISOString(),
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
        : groupSegmentsByDay(detail.segments, rangeStart, onCallCalendarDays, timeZone),
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

  const header = <OnCallPageHeader refreshing={refreshing} onRefresh={reloadAll} />;

  if (overview === null) {
    return (
      <OnCallOverviewLoading
        error={overviewError}
        pending={pending.overview}
        onRetry={() => void reloadOverview()}
        header={header}
      />
    );
  }

  const schedule = detail?.schedule ?? null;
  const isRotationMember =
    schedule?.members.some((member) => member.userId === currentUserId) ?? false;
  const colleagues = (schedule?.members ?? [])
    .filter((member) => member.userId !== currentUserId && member.isAvailable)
    .map((member) => ({ userId: member.userId, displayName: member.displayName }));
  const rangeLabel = formatOnCallRange(rangeStart, i18n.language, timeZone);

  return (
    <div className="page-in grid gap-4">
      {header}
      {overviewError === null ? null : (
        <ApiErrorText messageKey={overviewError.key} requestId={overviewError.requestId} />
      )}

      <OnCallOverviewCards
        me={me}
        meError={meError}
        swaps={swaps}
        swapsError={swapsError}
        pending={pending}
        busy={busy}
        overview={overview}
        selectedGroupId={selectedGroupId}
        onRetryMe={reloadMe}
        onRetrySwaps={reloadSwaps}
        onDecide={decide}
        onSelectGroup={selectGroup}
      />

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

      <OnCallPageDialogs
        detail={detail}
        scheduleOpen={scheduleOpen}
        setScheduleOpen={setScheduleOpen}
        rangeMode={rangeMode}
        setRangeMode={setRangeMode}
        timeZone={timeZone}
        colleagues={colleagues}
        reloadAll={reloadAll}
        pendingDelete={pendingDelete}
        setPendingDelete={setPendingDelete}
        deleteError={deleteError}
        setDeleteError={setDeleteError}
        busy={busy}
        onConfirmDelete={confirmDelete}
      />
    </div>
  );
}

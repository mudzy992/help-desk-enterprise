import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import type { OnCallQueryError } from "@/lib/on-call/use-on-call-overview-data";
import { formatOnCallTime, onCallSwapStatusKey } from "@/lib/on-call/on-call-view";
import { cn } from "@/lib/utils";
import type { OnCallMe, OnCallOverview, OnCallSwapView } from "@/services/on-call-api";

export function OnCallOverviewCards({
  me,
  meError,
  swaps,
  swapsError,
  pending,
  busy,
  overview,
  selectedGroupId,
  onRetryMe,
  onRetrySwaps,
  onDecide,
  onSelectGroup,
}: {
  readonly me: OnCallMe | null;
  readonly meError: OnCallQueryError | null;
  readonly swaps: readonly OnCallSwapView[];
  readonly swapsError: OnCallQueryError | null;
  readonly pending: { readonly me: boolean; readonly swaps: boolean };
  readonly busy: string | null;
  readonly overview: OnCallOverview;
  readonly selectedGroupId: string | null;
  readonly onRetryMe: () => void;
  readonly onRetrySwaps: () => void;
  readonly onDecide: (
    swap: OnCallSwapView,
    decision: "accept" | "decline" | "cancel",
  ) => Promise<void>;
  readonly onSelectGroup: (groupId: string) => void;
}) {
  const { t } = useTranslation();
  const pendingSwaps = swaps.filter((swap) => swap.status === "PENDING");
  const recentSwaps = swaps.filter((swap) => swap.status !== "PENDING").slice(0, 10);
  const reloadMe = onRetryMe;
  const reloadSwaps = onRetrySwaps;
  const decide = onDecide;
  const selectGroup = onSelectGroup;
  return (
    <>
      {" "}
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
    </>
  );
}

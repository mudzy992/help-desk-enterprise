import { ArrowUpCircle, BookOpen, ClipboardList, FileText, Lock } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/i18n/use-locale";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { TicketPlaybookController } from "@/lib/templates/use-ticket-playbook";
import { cn } from "@/lib/utils";

interface TicketPlaybookPanelProperties {
  readonly controller: TicketPlaybookController;
  /** Inserts a step's template into the composer (P1). */
  readonly onInsertTemplate?: (templateId: string, name: string) => void;
}

/**
 * Paket 1.4 (P2–P5): the checklist on the ticket, staff only. Any agent who
 * may change the ticket ticks steps; closed/archived/merged tickets are
 * read-only. The requester never sees this panel.
 */
export function TicketPlaybookPanel({ controller, onInsertTemplate }: TicketPlaybookPanelProperties) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { toast } = useToast();
  const { view, errorKey, busy } = controller;
  const [choice, setChoice] = useState("");
  const [detachOpen, setDetachOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (view === null) {
    return errorKey === null ? null : (
      <Card className="p-3 text-[12.5px] text-danger" role="alert">
        {t(errorKey)}
      </Card>
    );
  }
  if (!view.enabled) return null;

  const playbook = view.playbook;
  const progress = playbook?.progress;
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Card className="fade-in" data-testid="ticket-playbook-panel">
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <ClipboardList size={14} /> {playbook?.name ?? t("templates.checklist.title")}
          </span>
        }
        subtitle={
          playbook && progress
            ? `${t("templates.checklist.progress", { done: progress.done, total: progress.total })}${
                progress.requiredTotal > 0
                  ? ` · ${t("templates.checklist.requiredProgress", {
                      done: progress.requiredDone,
                      total: progress.requiredTotal,
                    })}`
                  : ""
              }`
            : undefined
        }
        actions={
          playbook && !view.readOnly ? (
            <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => setDetachOpen(true)}>
              {t("templates.checklist.detach")}
            </Button>
          ) : null
        }
      />
      <div className="space-y-3 px-4 py-3">
        {errorKey !== null ? (
          <p role="alert" className="text-[12.5px] text-danger">
            {t(errorKey)}
          </p>
        ) : null}
        {view.readOnly && playbook ? (
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Lock size={12} /> {t("templates.checklist.readOnly")}
          </p>
        ) : null}
        {playbook === null ? (
          <NoPlaybook
            view={view}
            busy={busy}
            choice={choice}
            onChoice={setChoice}
            onAttach={async () => {
              if (await controller.attach(choice)) setChoice("");
            }}
          />
        ) : (
          <>
            <Progress value={percent} tone={progress?.complete ? "success" : "primary"} />
            {playbook.latestVersion !== null && playbook.latestVersion > playbook.version && !view.readOnly ? (
              <div className="flex items-center gap-2 rounded-md border border-info/35 bg-info/8 px-2.5 py-1.5 text-[12px] text-foreground">
                <ArrowUpCircle size={13} className="shrink-0 text-info" />
                <span className="flex-1">{t("templates.checklist.upgradeAvailable", { version: playbook.latestVersion })}</span>
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    if (await controller.upgrade()) toast({ tone: "success", title: t("templates.checklist.upgraded") });
                  }}
                >
                  {t("templates.checklist.upgrade")}
                </Button>
              </div>
            ) : null}
            <ol className="space-y-2" data-testid="ticket-playbook-steps">
              {playbook.steps.map((step, index) => (
                <li
                  key={step.stepKey}
                  className={cn(
                    "rounded-md border px-2.5 py-2",
                    step.checked ? "border-success/30 bg-success/5" : "border-border/70",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={step.checked}
                      disabled={view.readOnly || busy}
                      onChange={(event) => void controller.setStep(step.stepKey, event.target.checked)}
                      aria-label={step.title}
                      data-testid={`playbook-step-${index + 1}`}
                      label={
                        <span className={cn("text-[12.5px] leading-5 text-foreground", step.checked && "text-muted-foreground line-through")}>
                          {step.title}
                        </span>
                      }
                    />
                    {step.required ? (
                      <Badge tone={step.checked ? "success" : "warning"} className="ml-auto shrink-0">
                        {t("templates.checklist.requiredBadge")}
                      </Badge>
                    ) : null}
                  </div>
                  {step.instructions ? (
                    <p className="mt-1 whitespace-pre-wrap pl-6 text-[11.5px] leading-relaxed text-muted-foreground">
                      {step.instructions}
                    </p>
                  ) : null}
                  {step.knowledgeArticleId || (step.responseTemplateId && onInsertTemplate) ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-6">
                      {step.knowledgeArticleId ? (
                        <Link
                          to={`/knowledge-base/${step.knowledgeArticleId}`}
                          className="inline-flex items-center gap-1 text-[11.5px] text-link hover:underline"
                        >
                          <BookOpen size={11} /> {step.knowledgeArticleTitle ?? t("templates.checklist.article")}
                        </Link>
                      ) : null}
                      {step.responseTemplateId && onInsertTemplate && !view.readOnly ? (
                        <button
                          type="button"
                          onClick={() => onInsertTemplate(step.responseTemplateId as string, step.responseTemplateName ?? "")}
                          className="inline-flex items-center gap-1 text-[11.5px] text-link hover:underline"
                        >
                          <FileText size={11} /> {t("templates.checklist.insertTemplate")}
                          {step.responseTemplateName ? `: ${step.responseTemplateName}` : ""}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {step.checked && step.checkedBy && step.checkedAt ? (
                    <p className="mt-1 pl-6 text-[10.5px] text-muted-foreground/80">
                      {t("templates.checklist.checkedBy", {
                        name: step.checkedBy.displayName,
                        time: formatRelativeTime(step.checkedAt, t, locale),
                      })}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-muted-foreground">
              {playbook.autoAttached
                ? t("templates.checklist.autoAttached")
                : playbook.attachedBy
                  ? t("templates.checklist.attachedBy", { name: playbook.attachedBy.displayName })
                  : null}
              {" · "}
              {t("templates.checklist.version", { version: playbook.version })}
              {view.mode === "block"
                ? ` · ${t("templates.checklist.modeBlock")}`
                : view.mode === "warn"
                  ? ` · ${t("templates.checklist.modeWarn")}`
                  : ""}
            </p>
          </>
        )}
      </div>
      <ConfirmDialog
        open={detachOpen}
        onOpenChange={(open) => {
          setDetachOpen(open);
          if (!open) setReason("");
        }}
        title={t("templates.checklist.detachTitle")}
        description={t("templates.checklist.detachBody")}
        intent="danger"
        confirmLabel={t("templates.checklist.detach")}
        isPending={busy || reason.trim().length < 3}
        onConfirm={async () => {
          if (await controller.detach(reason.trim())) {
            setDetachOpen(false);
            setReason("");
          }
        }}
      >
        <Field label={t("templates.checklist.detachReason")} required>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}

function NoPlaybook({
  view,
  busy,
  choice,
  onChoice,
  onAttach,
}: {
  readonly view: NonNullable<TicketPlaybookController["view"]>;
  readonly busy: boolean;
  readonly choice: string;
  readonly onChoice: (id: string) => void;
  readonly onAttach: () => Promise<void>;
}) {
  const { t } = useTranslation();
  if (view.available.length === 0) {
    return <p className="text-[12.5px] text-muted-foreground">{t("templates.checklist.noneAvailable")}</p>;
  }
  if (view.readOnly) {
    return <p className="text-[12.5px] text-muted-foreground">{t("templates.checklist.none")}</p>;
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-[180px] flex-1">
        <span className="sr-only">{t("templates.checklist.choose")}</span>
        <Select value={choice} onChange={(event) => onChoice(event.target.value)} data-testid="ticket-playbook-select">
          <option value="">{t("templates.checklist.choose")}</option>
          {view.available.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({t(`templates.checklist.match.${item.match}`)})
            </option>
          ))}
        </Select>
      </label>
      <Button type="button" size="sm" disabled={busy || choice === ""} onClick={() => void onAttach()}>
        {t("templates.checklist.attach")}
      </Button>
    </div>
  );
}

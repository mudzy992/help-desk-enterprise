import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  controlClassName,
  errorTextClassName,
  hintClassName,
  selectClassName,
} from "@/components/ui/control";
import { Field } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  previewNextReportRun,
  reportScheduleNameMaxLength,
  validateReportScheduleForm,
  type ReportScheduleFormError,
} from "@/lib/reports/report-schedule-form";
import { readReportErrorCode } from "@/lib/reports/report-trends-view";
import { mapApiError } from "@/lib/map-api-error";
import { reportErrorMessageKeys, type TrendsFilterOption } from "@/components/reports/trends/report-trends-panel";
import {
  createReportSchedule,
  listReportRecipientCandidates,
  reportScheduleFrequencies,
  updateReportSchedule,
  type ReportSchedule,
  type ReportScheduleFrequency,
  type ReportScheduleList,
  type ReportScheduleRecipient,
  type ReportScheduleSection,
} from "@/services/report-schedules-api";
import { reportTrendPriorities, type ReportTrendPriority } from "@/services/report-trends-api";

export type ReportScheduleDraft = {
  readonly organizationalUnitId: string | null;
  readonly serviceId: string | null;
  readonly groupId: string | null;
  readonly priority: ReportTrendPriority | null;
};

interface ReportScheduleSheetProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly list: ReportScheduleList;
  /** Existing schedule (edit) or a draft from „Zakaži ovaj izvještaj”. */
  readonly schedule: ReportSchedule | null;
  readonly draft: ReportScheduleDraft | null;
  readonly units: readonly TrendsFilterOption[];
  readonly services: readonly TrendsFilterOption[];
  readonly groups: readonly TrendsFilterOption[] | null;
  readonly onSaved: (schedule: ReportSchedule) => void;
}

const frequencyKeys = {
  WEEKLY: "reports.schedules.frequency.WEEKLY",
  MONTHLY: "reports.schedules.frequency.MONTHLY",
} as const;

const sectionKeys = {
  kpi: "reports.schedules.sections.kpi",
  trend: "reports.schedules.sections.trend",
  topServices: "reports.schedules.sections.topServices",
  overdue: "reports.schedules.sections.overdue",
} as const;

const priorityKeys = {
  LOW: "reports.trends.priority.LOW",
  MEDIUM: "reports.trends.priority.MEDIUM",
  HIGH: "reports.trends.priority.HIGH",
  CRITICAL: "reports.trends.priority.CRITICAL",
} as const;

const formErrorKeys = {
  name: "reports.schedules.form.errors.name",
  sendTime: "reports.schedules.form.errors.sendTime",
  unit: "reports.schedules.form.errors.unit",
  sections: "reports.schedules.form.errors.sections",
  recipients: "reports.schedules.form.errors.recipients",
  recipientLimit: "reports.schedules.form.errors.recipientLimit",
} as const satisfies Record<ReportScheduleFormError, string>;

/** Paket 2.5 (design §7.3): create / edit a schedule (Sheet, max-w-md). */
export function ReportScheduleSheet({
  open,
  onOpenChange,
  list,
  schedule,
  draft,
  units,
  services,
  groups,
  onSaved,
}: ReportScheduleSheetProperties) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<ReportScheduleFrequency>("WEEKLY");
  const [sendTime, setSendTime] = useState(list.settings.defaultSendTime);
  const [unitId, setUnitId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [priority, setPriority] = useState("");
  const [sections, setSections] = useState<readonly ReportScheduleSection[]>(list.sections);
  const [packKeys, setPackKeys] = useState<readonly string[]>([]);
  const [recipients, setRecipients] = useState<readonly ReportScheduleRecipient[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<readonly ReportScheduleRecipient[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setShowErrors(false);
    setSaveError(null);
    setSearch("");
    if (schedule !== null) {
      setName(schedule.name);
      setFrequency(schedule.frequency);
      setSendTime(schedule.sendTime);
      setUnitId(schedule.organizationalUnit.id);
      setServiceId(schedule.service?.id ?? "");
      setGroupId(schedule.group?.id ?? "");
      setPriority(schedule.priority ?? "");
      setSections(schedule.sections);
      setPackKeys(schedule.packKeys);
      setRecipients(schedule.recipients);
      setEnabled(schedule.enabled);
      return;
    }
    setName("");
    setFrequency("WEEKLY");
    setSendTime(list.settings.defaultSendTime);
    setUnitId(draft?.organizationalUnitId ?? units[0]?.id ?? "");
    setServiceId(draft?.serviceId ?? "");
    setGroupId(draft?.groupId ?? "");
    setPriority(draft?.priority ?? "");
    setSections(list.sections);
    setPackKeys([]);
    setRecipients([]);
    setEnabled(true);
  }, [open, schedule, draft, list, units]);

  useEffect(() => {
    if (!open || unitId === "") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      listReportRecipientCandidates(unitId, search)
        .then((loaded) => !cancelled && setCandidates(loaded.users))
        .catch(() => !cancelled && setCandidates([]));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, unitId, search]);

  const errors = validateReportScheduleForm(
    {
      name,
      frequency,
      sendTime,
      organizationalUnitId: unitId,
      sections,
      recipientUserIds: recipients.map((recipient) => recipient.id),
    },
    list.settings.maxRecipients,
  );
  const next = previewNextReportRun(frequency, sendTime, new Date());
  const selectedIds = useMemo(() => new Set(recipients.map((recipient) => recipient.id)), [recipients]);
  const toggle = <T extends string>(values: readonly T[], value: T, on: boolean): readonly T[] =>
    on ? [...values.filter((item) => item !== value), value] : values.filter((item) => item !== value);

  const submit = async () => {
    setShowErrors(true);
    if (errors.length > 0) return;
    setSaving(true);
    setSaveError(null);
    const input = {
      name: name.trim(),
      frequency,
      sendTime,
      organizationalUnitId: unitId,
      ...(serviceId === "" ? {} : { serviceId }),
      ...(groupId === "" ? {} : { groupId }),
      ...(priority === "" ? {} : { priority: priority as ReportTrendPriority }),
      // Keep the canonical section order of the e-mail.
      sections: list.sections.filter((section) => sections.includes(section)),
      packKeys,
      recipientUserIds: recipients.map((recipient) => recipient.id),
      enabled,
    };
    try {
      const saved = schedule === null ? await createReportSchedule(input) : await updateReportSchedule(schedule.id, input);
      onSaved(saved);
      onOpenChange(false);
    } catch (caught) {
      const code = readReportErrorCode(caught);
      setSaveError(code === null ? t(mapApiError(caught)) : t(reportErrorMessageKeys[code]));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full max-w-md flex-col p-0" data-testid="report-schedule-sheet">
        <div className="border-b border-border/70 px-5 py-4">
          <SheetTitle className="text-[15px] font-semibold text-foreground">
            {schedule === null ? t("reports.schedules.form.createTitle") : t("reports.schedules.form.editTitle")}
          </SheetTitle>
          <SheetDescription className={hintClassName}>
            {t("reports.schedules.form.description", { zone: list.settings.timeZone })}
          </SheetDescription>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Field label={t("reports.schedules.form.name")} required>
            <input
              className={controlClassName}
              value={name}
              maxLength={reportScheduleNameMaxLength}
              onChange={(event) => setName(event.target.value)}
              data-testid="schedule-name"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("reports.schedules.form.frequency")} required>
              <select
                className={selectClassName}
                value={frequency}
                onChange={(event) => setFrequency(event.target.value as ReportScheduleFrequency)}
                data-testid="schedule-frequency"
              >
                {reportScheduleFrequencies.map((option) => (
                  <option key={option} value={option}>
                    {t(frequencyKeys[option])}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("reports.schedules.form.sendTime")} required>
              <input
                type="time"
                step={300}
                className={controlClassName}
                value={sendTime}
                onChange={(event) => setSendTime(event.target.value)}
                data-testid="schedule-time"
              />
            </Field>
          </div>
          <p className={hintClassName} data-testid="schedule-next-preview">
            {next === null
              ? t("reports.schedules.form.nextUnknown")
              : t("reports.schedules.form.next", {
                  value: next.toLocaleString(i18n.language, {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
          </p>

          <Field label={t("reports.packs.unit")} required>
            <select
              className={selectClassName}
              value={unitId}
              onChange={(event) => {
                setUnitId(event.target.value);
                setRecipients([]);
              }}
              data-testid="schedule-unit"
            >
              {units.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("reports.trends.filters.service")}>
              <select className={selectClassName} value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
                <option value="">{t("reports.trends.filters.all")}</option>
                {services.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("reports.trends.filters.priority")}>
              <select className={selectClassName} value={priority} onChange={(event) => setPriority(event.target.value)}>
                <option value="">{t("reports.trends.filters.all")}</option>
                {reportTrendPriorities.map((option) => (
                  <option key={option} value={option}>
                    {t(priorityKeys[option])}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {groups !== null ? (
            <Field label={t("reports.trends.filters.group")}>
              <select className={selectClassName} value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                <option value="">{t("reports.trends.filters.all")}</option>
                {groups.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <fieldset>
            <legend className="mb-2 text-[12.5px] font-medium text-foreground">
              {t("reports.schedules.form.sections")}
            </legend>
            <div className="flex flex-col gap-2.5">
              {list.sections.map((section) => (
                <Checkbox
                  key={section}
                  checked={sections.includes(section)}
                  onChange={(event) => setSections(toggle(sections, section, event.target.checked))}
                  label={t(sectionKeys[section])}
                />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-[12.5px] font-medium text-foreground">
              {t("reports.schedules.form.attachments")}
            </legend>
            <p className={`${hintClassName} mb-2`}>
              {t("reports.schedules.form.attachmentsHint", { rows: list.settings.attachmentMaxRows })}
            </p>
            {list.packs.length === 0 ? (
              <p className={hintClassName}>{t("reports.packs.noneBody")}</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {list.packs.map((pack) => (
                  <Checkbox
                    key={pack}
                    checked={packKeys.includes(pack)}
                    onChange={(event) => setPackKeys(toggle(packKeys, pack, event.target.checked))}
                    label={t(`reports.packs.names.${pack}` as "reports.packs.names.monthly_kpi", { defaultValue: pack })}
                  />
                ))}
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-[12.5px] font-medium text-foreground">
              {t("reports.schedules.form.recipients")} <span className="text-danger">*</span>
            </legend>
            <p className={`${hintClassName} mb-2`}>
              {t("reports.schedules.form.recipientsHint", { max: list.settings.maxRecipients })}
            </p>
            {recipients.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5" data-testid="schedule-recipients">
                {recipients.map((recipient) => (
                  <span
                    key={recipient.id}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover py-0.5 pl-2.5 pr-1 text-[12px]"
                    title={recipient.email}
                  >
                    {recipient.displayName}
                    {recipient.isActive === false ? (
                      <span className="text-danger">· {t("reports.schedules.form.inactive")}</span>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={t("reports.schedules.form.removeRecipient", { name: recipient.displayName })}
                      onClick={() => setRecipients(recipients.filter((item) => item.id !== recipient.id))}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className={`${controlClassName} pl-8`}
                placeholder={t("reports.schedules.form.searchRecipients")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                data-testid="schedule-recipient-search"
              />
            </div>
            <ul className="mt-1.5 max-h-44 overflow-y-auto rounded-md border border-border/70">
              {candidates.filter((candidate) => !selectedIds.has(candidate.id)).length === 0 ? (
                <li className={`${hintClassName} px-3 py-2`}>{t("reports.schedules.form.noCandidates")}</li>
              ) : (
                candidates
                  .filter((candidate) => !selectedIds.has(candidate.id))
                  .map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-surface-hover"
                        onClick={() => setRecipients([...recipients, candidate])}
                        data-testid="schedule-candidate"
                      >
                        <span className="truncate text-foreground">{candidate.displayName}</span>
                        <span className="truncate text-[11.5px] text-muted-foreground">{candidate.email}</span>
                      </button>
                    </li>
                  ))
              )}
            </ul>
          </fieldset>

          <label className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-medium text-foreground">{t("reports.schedules.form.enabled")}</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </label>

          {showErrors && errors.length > 0 ? (
            <ul className={errorTextClassName} role="alert">
              {errors.map((error) => (
                <li key={error}>{t(formErrorKeys[error], { max: list.settings.maxRecipients })}</li>
              ))}
            </ul>
          ) : null}
          {saveError !== null ? (
            <p className={errorTextClassName} role="alert">
              {saveError}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("reports.schedules.form.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={saving} data-testid="schedule-save">
            {t("reports.schedules.form.save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

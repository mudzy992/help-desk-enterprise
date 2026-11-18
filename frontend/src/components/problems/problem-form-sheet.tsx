import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError } from "@/lib/problems/problem-view";
import { ticketPriorityValues, ticketSeverityLabelKey } from "@/lib/tickets/ticket-constants";
import { translateText } from "@/lib/i18n/translate-text";
import {
  createProblemFull,
  problemQueryKeys,
  searchProblemOwners,
  updateProblem,
  type ProblemDetail,
  type ProblemOptions,
  type ProblemSeverity,
} from "@/services/problems-api";
import { requestProblemHandoff } from "@/services/problem-handoffs-api";

type Owner = { readonly id: string; readonly displayName: string; readonly email?: string };

interface ProblemFormSheetProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly options: ProblemOptions;
  /** Editing when set; creating otherwise. */
  readonly problem?: ProblemDetail;
  readonly onSaved: (problemId: string) => void;
  /** Only problem managers (and admins) pick an owner; agents leave it to the group. */
  readonly canAssignOwner: boolean;
}

/**
 * Delivery invariant (requirement): create a problem by hand or edit its basics (title,
 * description, impact/urgency, unit, owner, group, service). The analysis
 * fields are edited on the Analysis tab.
 */
export function ProblemFormSheet({
  open,
  onOpenChange,
  options,
  problem,
  onSaved,
  canAssignOwner,
}: ProblemFormSheetProperties) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const editing = problem !== undefined;
  // W7.26: one create key per opened sheet; a retried create replays the problem.
  const createRequestId = useRef<string>(crypto.randomUUID());
  useEffect(() => {
    if (open && !editing) createRequestId.current = crypto.randomUUID();
  }, [open, editing]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [impact, setImpact] = useState<ProblemSeverity>("MEDIUM");
  const [urgency, setUrgency] = useState<ProblemSeverity>("MEDIUM");
  const [unitId, setUnitId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [owner, setOwner] = useState<Owner | null>(null);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerDebounced, setOwnerDebounced] = useState("");
  const [handoffReason, setHandoffReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(problem?.title ?? "");
    setDescription(problem?.description ?? "");
    setImpact(problem?.impact ?? "MEDIUM");
    setUrgency(problem?.urgency ?? "MEDIUM");
    setUnitId(
      problem?.organizationalUnit.id ??
        options.homeOrganizationalUnitId ??
        options.units[0]?.id ??
        "",
    );
    setGroupId(problem?.group?.id ?? "");
    setServiceId(problem?.service?.id ?? "");
    setOwner(problem?.owner ?? null);
    setOwnerSearch("");
    setHandoffReason("");
    setError(null);
  }, [open, problem, options]);

  useEffect(() => {
    const handle = window.setTimeout(() => setOwnerDebounced(ownerSearch.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [ownerSearch]);

  const owners = useQuery({
    queryKey: problemQueryKeys.owners(ownerDebounced, groupId),
    queryFn: () => searchProblemOwners(ownerDebounced, groupId),
    // Owners are the problem managers of the chosen group (decision 2026-10-01).
    enabled: open && canAssignOwner && groupId !== "",
    retry: false,
  });

  // W7.29: the catalog decides which services this user may read, so the
  // service a problem already carries may be missing from the picker. Keeping
  // it selectable prevents a silent removal when the other fields are saved.
  const services =
    problem !== undefined &&
    problem.service !== null &&
    !options.services.some((service) => service.id === problem.service?.id)
      ? [problem.service, ...options.services]
      : options.services;

  // A unit outside the list (another scope) stays selectable while editing.
  const units =
    problem !== undefined &&
    !options.units.some((unit) => unit.id === problem.organizationalUnit.id)
      ? [
          {
            id: problem.organizationalUnit.id,
            name: problem.organizationalUnit.name,
            path: problem.organizationalUnit.ouPath,
          },
          ...options.units,
        ]
      : options.units;

  // W7.28: an existing problem changes group only through a recorded handoff.
  const groupChanged = editing && groupId !== (problem.group?.id ?? "");
  const handoffReasonReady = handoffReason.trim().length >= 5;

  const canSubmit =
    !saving &&
    title.trim().length >= 3 &&
    description.trim().length > 0 &&
    unitId !== "" &&
    groupId !== "" &&
    (!groupChanged || handoffReasonReady);

  const changeGroup = (next: string) => {
    setGroupId(next);
    // The owner must be a member of the problem group.
    setOwner(null);
    setOwnerSearch("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const base = {
      title: title.trim(),
      description: description.trim(),
      impact,
      urgency,
      organizationalUnitId: unitId,
      serviceId: serviceId || null,
      groupId,
      ...(canAssignOwner ? { ownerUserId: owner?.id ?? null } : {}),
    };

    // The group is not a field: save the rest first, then ask for the handoff.
    // The owner is resolved when the target group accepts, so it is not sent.
    if (groupChanged) {
      const { groupId: _targetGroupId, ownerUserId: _owner, ...basics } = base;
      try {
        await updateProblem(problem.id, { version: problem.version, ...basics });
      } catch (caught) {
        const message = t(mapProblemError(caught) ?? mapApiError(caught));
        setError(message);
        toast({ tone: "danger", title: message });
        setSaving(false);
        return;
      }
      try {
        const result = await requestProblemHandoff(problem.id, {
          toGroupId: groupId,
          reason: handoffReason.trim(),
        });
        onOpenChange(false);
        toast({
          tone: "success",
          title:
            result.handoff.status === "ACCEPTED"
              ? t("problems.handoff.acceptedToast", { group: result.handoff.toGroup.name })
              : t("problems.handoff.pendingToast", { group: result.handoff.toGroup.name }),
        });
        onSaved(result.problem.id);
      } catch (caught) {
        // The basics are saved; the transfer is not. Say so and let the user
        // request it again from the handoff panel on the problem.
        const message = t("problems.handoff.savePartial", {
          reason: t(mapProblemError(caught) ?? mapApiError(caught)),
        });
        onOpenChange(false);
        toast({ tone: "danger", title: message });
        onSaved(problem.id);
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      const saved = editing
        ? await updateProblem(problem.id, { version: problem.version, ...base })
        : await createProblemFull({ ...base, clientRequestId: createRequestId.current });
      onOpenChange(false);
      onSaved(saved.id);
    } catch (caught) {
      const message = t(mapProblemError(caught) ?? mapApiError(caught));
      // A long form keeps the inline error and repeats it as a toast.
      setError(message);
      toast({ tone: "danger", title: message });
    } finally {
      setSaving(false);
    }
  };

  const severityOptions = ticketPriorityValues.map((value) => (
    <option key={value} value={value}>
      {translateText(t, ticketSeverityLabelKey[value])}
    </option>
  ));

  return (
    <Sheet open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <SheetContent
        side="right"
        className="flex w-full max-w-lg flex-col overflow-y-auto p-5"
        data-testid="problem-form-sheet"
      >
        <SheetTitle>
          {editing ? t("problems.form.editTitle") : t("problems.form.createTitle")}
        </SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {editing ? t("problems.form.editDescription") : t("problems.form.createDescription")}
        </SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          {options.hasMore.units || options.hasMore.services || options.hasMore.groups ? (
            // BA-problems-17: a capped picker would otherwise hide options silently.
            <p className={hintClassName} data-testid="problem-form-pickers-capped">
              {t("problems.lists.pickerCapped")}
            </p>
          ) : null}
          <Field label={t("problems.fields.title")} required>
            {(control) => (
              <Input
                {...control}
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
              />
            )}
          </Field>
          <Field label={t("problems.fields.description")} required>
            {(control) => (
              <Textarea
                {...control}
                rows={5}
                value={description}
                maxLength={8000}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("problems.fields.impact")}>
              {(control) => (
                <Select
                  {...control}
                  value={impact}
                  onChange={(event) => setImpact(event.target.value as ProblemSeverity)}
                >
                  {severityOptions}
                </Select>
              )}
            </Field>
            <Field label={t("problems.fields.urgency")}>
              {(control) => (
                <Select
                  {...control}
                  value={urgency}
                  onChange={(event) => setUrgency(event.target.value as ProblemSeverity)}
                >
                  {severityOptions}
                </Select>
              )}
            </Field>
          </div>
          <p className={hintClassName}>{t("problems.form.priorityHint")}</p>
          <Field label={t("problems.fields.organizationalUnit")} required>
            {(control) => (
              <Select
                {...control}
                data-testid="problem-form-unit"
                value={unitId}
                onChange={(event) => setUnitId(event.target.value)}
              >
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.path}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("problems.fields.group")} hint={t("problems.form.groupHint")} required>
            {(control) => (
              <Select
                {...control}
                data-testid="problem-form-group"
                value={groupId}
                onChange={(event) => changeGroup(event.target.value)}
              >
                <option value="">{t("problems.form.groupPlaceholder")}</option>
                {problem?.group &&
                !options.groups.some((group) => group.id === problem.group?.id) ? (
                  <option value={problem.group.id}>{problem.group.name}</option>
                ) : null}
                {options.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {groupChanged ? (
            <Field
              label={t("problems.handoff.reason")}
              hint={t("problems.handoff.reasonHint")}
              required
            >
              {(control) => (
                <Textarea
                  {...control}
                  data-testid="problem-form-handoff-reason"
                  rows={3}
                  maxLength={2000}
                  value={handoffReason}
                  onChange={(event) => setHandoffReason(event.target.value)}
                />
              )}
            </Field>
          ) : null}
          {groupChanged ? <p className={hintClassName}>{t("problems.handoff.ownerHint")}</p> : null}
          {canAssignOwner && !groupChanged ? (
            <div className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-foreground">
                {t("problems.fields.owner")}
              </span>
              {owner !== null ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-[12.5px]">
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">{owner.displayName}</span>
                    {owner.email ? (
                      <span className="block truncate text-[11.5px] text-muted-foreground">
                        {owner.email}
                      </span>
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("problems.form.clearOwner")}
                    onClick={() => setOwner(null)}
                  >
                    <X size={13} aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    value={ownerSearch}
                    maxLength={120}
                    onChange={(event) => setOwnerSearch(event.target.value)}
                    placeholder={t("problems.form.ownerSearch")}
                    aria-label={t("problems.form.ownerSearch")}
                  />
                  {groupId !== "" ? (
                    <ul
                      className="grid max-h-40 gap-0.5 overflow-y-auto rounded-md border border-border p-1"
                      aria-label={t("problems.form.ownerResults")}
                    >
                      {(owners.data?.items ?? []).length === 0 ? (
                        <li className={`px-2 py-1 ${hintClassName}`}>
                          {owners.isFetching
                            ? t("ui.loading")
                            : t("problems.form.ownerNoneWithUnit", {
                                unit: owners.data?.unitPath ?? "—",
                              })}
                        </li>
                      ) : (
                        (owners.data?.items ?? []).map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className="w-full truncate rounded-md px-2 py-1 text-left text-[12.5px] text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                              onClick={() => {
                                setOwner(item);
                                setOwnerSearch("");
                              }}
                            >
                              {item.displayName}
                              {item.email ? (
                                <span className="text-muted-foreground"> · {item.email}</span>
                              ) : null}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : (
                    <p className={hintClassName}>{t("problems.form.ownerPickGroup")}</p>
                  )}
                </>
              )}
            </div>
          ) : (
            <p className={hintClassName}>{t("problems.form.ownerByGroup")}</p>
          )}
          <div className="grid gap-3">
            <Field label={t("problems.fields.service")}>
              {(control) => (
                <Select
                  {...control}
                  data-testid="problem-form-service"
                  value={serviceId}
                  onChange={(event) => setServiceId(event.target.value)}
                >
                  <option value="">{t("problems.form.none")}</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {error !== null ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("ui.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit} data-testid="problem-form-submit">
              {saving
                ? t("problems.link.saving")
                : editing
                  ? t("problems.form.save")
                  : t("problems.form.create")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

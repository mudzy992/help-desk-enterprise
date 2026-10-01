import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { formatAssetDateTime } from "@/lib/assets/asset-view";
import { ticketText } from "@/lib/tickets/ticket-text";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError, rootCauseLabel } from "@/lib/problems/problem-view";
import { updateProblem, type ProblemDetail, type ProblemWhy } from "@/services/problems-api";

const whysMax = 5;

function sameWhys(left: readonly ProblemWhy[], right: readonly ProblemWhy[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Paket 3.3 (§6, §7): root cause analysis: category, cause, up to five
 * "why?" steps, workaround and resolution. Read-only without `problem.manage`
 * or once the problem is closed/cancelled.
 */
export function ProblemAnalysisPanel({
  problem,
  categories,
  onSaved,
}: {
  readonly problem: ProblemDetail;
  readonly categories: readonly string[];
  readonly onSaved: (next: ProblemDetail) => void;
}) {
  const { t, i18n } = useTranslation();
  const editable = problem.permissions.canManage && problem.status !== "CLOSED" && problem.status !== "CANCELLED";
  const [category, setCategory] = useState(problem.rootCauseCategory ?? "");
  const [rootCause, setRootCause] = useState(problem.rootCause ?? "");
  const [whys, setWhys] = useState<ProblemWhy[]>([...problem.rcaWhys]);
  const [workaround, setWorkaround] = useState(problem.workaround ?? "");
  const [resolution, setResolution] = useState(problem.resolution ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setCategory(problem.rootCauseCategory ?? "");
    setRootCause(problem.rootCause ?? "");
    setWhys([...problem.rcaWhys]);
    setWorkaround(problem.workaround ?? "");
    setResolution(problem.resolution ?? "");
  }, [problem]);

  const cleanWhys = whys
    .map((why) => ({ question: why.question.trim(), answer: why.answer.trim() }))
    .filter((why) => why.question.length > 0 || why.answer.length > 0);
  const dirty =
    category !== (problem.rootCauseCategory ?? "") ||
    rootCause.trim() !== (problem.rootCause ?? "") ||
    !sameWhys(cleanWhys, problem.rcaWhys) ||
    workaround.trim() !== (problem.workaround ?? "") ||
    resolution.trim() !== (problem.resolution ?? "");

  // A category removed from the setting stays visible on old problems.
  const categoryOptions = problem.rootCauseCategory && !categories.includes(problem.rootCauseCategory) ? [problem.rootCauseCategory, ...categories] : categories;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const next = await updateProblem(problem.id, {
        version: problem.version,
        rootCauseCategory: category || null,
        rootCause: rootCause.trim() || null,
        rcaWhys: cleanWhys.length > 0 ? cleanWhys : null,
        workaround: workaround.trim() || null,
        resolution: resolution.trim() || null,
      });
      setSavedAt(Date.now());
      onSaved(next);
    } catch (caught) {
      setError(t(mapProblemError(caught) ?? mapApiError(caught)));
    } finally {
      setSaving(false);
    }
  };

  if (!editable) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-0">
          <CardHeader title={t("problems.analysis.causeTitle")} />
          <dl className="grid gap-3 px-4 py-3 text-[12.5px]">
            <ReadRow label={t("problems.fields.rootCauseCategory")} value={rootCauseLabel((key) => ticketText(t, key), problem.rootCauseCategory)} />
            <ReadRow label={t("problems.fields.rootCause")} value={problem.rootCause} />
            <div>
              <dt className="text-muted-foreground">{t("problems.fields.whys")}</dt>
              <dd className="mt-1">
                {problem.rcaWhys.length === 0 ? (
                  "—"
                ) : (
                  <ol className="grid list-decimal gap-1 pl-5">
                    {problem.rcaWhys.map((why, index) => (
                      <li key={index}>
                        <span className="font-medium text-foreground">{why.question}</span>
                        {why.answer ? <span className="block text-muted-foreground">{why.answer}</span> : null}
                      </li>
                    ))}
                  </ol>
                )}
              </dd>
            </div>
          </dl>
        </Card>
        <Card className="p-0">
          <CardHeader title={t("problems.analysis.outcomeTitle")} />
          <dl className="grid gap-3 px-4 py-3 text-[12.5px]">
            <ReadRow label={t("problems.fields.workaround")} value={problem.workaround} />
            <ReadRow label={t("problems.fields.resolution")} value={problem.resolution} />
          </dl>
        </Card>
      </div>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)} noValidate data-testid="problem-analysis-form">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-0">
          <CardHeader title={t("problems.analysis.causeTitle")} subtitle={t("problems.analysis.causeSubtitle")} />
          <div className="grid gap-3 px-4 py-3">
            <Field label={t("problems.fields.rootCauseCategory")} hint={t("problems.analysis.categoryHint")}>
              {(control) => (
                <Select {...control} value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">{t("problems.form.none")}</option>
                  {categoryOptions.map((key) => (
                    <option key={key} value={key}>
                      {rootCauseLabel((key) => ticketText(t, key), key)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("problems.fields.rootCause")} hint={t("problems.analysis.rootCauseHint")}>
              {(control) => <Textarea {...control} rows={4} maxLength={8000} value={rootCause} onChange={(event) => setRootCause(event.target.value)} />}
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[12.5px] font-medium text-foreground">{t("problems.fields.whys")}</legend>
              <p className={hintClassName}>{t("problems.analysis.whysHint")}</p>
              {whys.map((why, index) => (
                <div key={index} className="grid gap-1.5 rounded-md border border-border/70 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="tnum text-[11.5px] font-medium text-muted-foreground">{index + 1}.</span>
                    <Input
                      value={why.question}
                      maxLength={500}
                      placeholder={t("problems.analysis.whyQuestion")}
                      aria-label={t("problems.analysis.whyQuestionLabel", { index: index + 1 })}
                      onChange={(event) => setWhys((current) => current.map((item, i) => (i === index ? { ...item, question: event.target.value } : item)))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("problems.analysis.whyRemove", { index: index + 1 })}
                      onClick={() => setWhys((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </Button>
                  </div>
                  <Textarea
                    rows={2}
                    value={why.answer}
                    maxLength={500}
                    placeholder={t("problems.analysis.whyAnswer")}
                    aria-label={t("problems.analysis.whyAnswerLabel", { index: index + 1 })}
                    onChange={(event) => setWhys((current) => current.map((item, i) => (i === index ? { ...item, answer: event.target.value } : item)))}
                  />
                </div>
              ))}
              {whys.length < whysMax ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="justify-self-start"
                  onClick={() => setWhys((current) => [...current, { question: current.length === 0 ? t("problems.analysis.whyDefault") : "", answer: "" }])}
                >
                  <Plus size={12} aria-hidden="true" />
                  {t("problems.analysis.whyAdd")}
                </Button>
              ) : null}
            </fieldset>
          </div>
        </Card>
        <Card className="p-0">
          <CardHeader title={t("problems.analysis.outcomeTitle")} subtitle={t("problems.analysis.outcomeSubtitle")} />
          <div className="grid gap-3 px-4 py-3">
            <Field
              label={t("problems.fields.workaround")}
              hint={
                problem.workaroundAt
                  ? t("problems.analysis.workaroundUpdated", { date: formatAssetDateTime(problem.workaroundAt, i18n.language) })
                  : t("problems.analysis.workaroundHint")
              }
            >
              {(control) => <Textarea {...control} rows={5} maxLength={8000} value={workaround} onChange={(event) => setWorkaround(event.target.value)} />}
            </Field>
            <Field label={t("problems.fields.resolution")} hint={t("problems.analysis.resolutionHint")}>
              {(control) => <Textarea {...control} rows={5} maxLength={8000} value={resolution} onChange={(event) => setResolution(event.target.value)} />}
            </Field>
          </div>
        </Card>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {error !== null ? (
          <p role="alert" className={`mr-auto ${errorTextClassName}`}>
            {error}
          </p>
        ) : savedAt !== null && !dirty ? (
          <p role="status" className={`mr-auto ${hintClassName}`}>
            {t("problems.analysis.saved")}
          </p>
        ) : null}
        <Button type="submit" disabled={!dirty || saving} data-testid="problem-analysis-save">
          {saving ? t("problems.link.saving") : t("problems.analysis.save")}
        </Button>
      </div>
    </form>
  );
}

function ReadRow({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{value && value.length > 0 ? value : "—"}</dd>
    </div>
  );
}

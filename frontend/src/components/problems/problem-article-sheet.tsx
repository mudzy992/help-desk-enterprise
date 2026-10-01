import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError } from "@/lib/problems/problem-view";
import { createProblemArticle, getProblemArticleDraft, problemDetailKeys, type ProblemOptions } from "@/services/problems-api";

interface ProblemArticleSheetProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly problemId: string;
  readonly options: ProblemOptions | undefined;
  readonly onCreated: (article: { readonly id: string; readonly title: string }) => void;
}

/**
 * Paket 3.3 (P4, §7): the known error becomes a knowledge article DRAFT
 * (symptoms, cause, workaround). Personal data is replaced on the server as in
 * 2.9; the agent reviews and edits the text, and picks a service when the
 * problem has none. Publishing follows the regular knowledge base workflow.
 */
export function ProblemArticleSheet({ open, onOpenChange, problemId, options, onCreated }: ProblemArticleSheetProperties) {
  const { t } = useTranslation();
  const draft = useQuery({
    queryKey: problemDetailKeys.articleDraft(problemId),
    queryFn: () => getProblemArticleDraft(problemId),
    retry: false,
    enabled: open,
    gcTime: 0,
  });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = draft.data;
  useEffect(() => {
    if (!open || data === undefined) return;
    setTitle(data.title);
    setBody(data.body);
    setServiceId(data.serviceId ?? "");
    setUnitId(data.organizationalUnitId);
    setError(null);
  }, [open, data]);

  const canSubmit = !pending && data !== undefined && title.trim().length >= 3 && body.trim().length > 0 && serviceId !== "" && unitId !== "";
  const replaced = data === undefined ? 0 : data.replacements.email + data.replacements.person + data.replacements.ip + data.replacements.phone;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const created = await createProblemArticle(problemId, {
        title: title.trim(),
        body: body.trim(),
        serviceId,
        organizationalUnitId: unitId,
      });
      onOpenChange(false);
      onCreated(created);
    } catch (caught) {
      setError(t(mapProblemError(caught) ?? mapApiError(caught)));
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <SheetContent side="right" className="flex w-full max-w-lg flex-col overflow-y-auto p-5" data-testid="problem-article-sheet">
        <SheetTitle>{t("problems.article.title")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">{t("problems.article.hint")}</SheetDescription>
        {draft.error ? (
          <p role="alert" className={`mt-4 ${errorTextClassName}`}>
            {t(mapProblemError(draft.error) ?? mapApiError(draft.error))}
          </p>
        ) : data === undefined ? (
          <PanelSkeleton className="mt-4" label={t("problems.article.title")} />
        ) : (
          <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
            <div role="status" className="flex items-start gap-2 rounded-md border border-primary/25 bg-primary/8 px-3 py-2 text-[12px] text-foreground">
              <ShieldCheck size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-link" />
              <span>
                {replaced === 0
                  ? t("knowledgeBase.portal.fromReply.noReplacements")
                  : t("knowledgeBase.portal.fromReply.replacements", { ...data.replacements })}{" "}
                {t("knowledgeBase.portal.fromReply.reviewReminder")}
              </span>
            </div>
            <Field label={t("knowledgeBase.titleField")} required>
              {(control) => <Input {...control} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />}
            </Field>
            <Field label={t("knowledgeBase.bodyField")} required>
              {(control) => (
                <Textarea {...control} value={body} maxLength={20000} className="min-h-64" onChange={(event) => setBody(event.target.value)} data-testid="problem-article-body" />
              )}
            </Field>
            <Field label={t("problems.fields.service")} required hint={data.serviceId === null ? t("problems.article.serviceHint") : undefined}>
              {(control) => (
                <Select {...control} value={serviceId} onChange={(event) => setServiceId(event.target.value)} data-testid="problem-article-service">
                  <option value="">{t("problems.article.pickService")}</option>
                  {(options?.services ?? []).map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("problems.fields.organizationalUnit")} required>
              {(control) => (
                <Select {...control} value={unitId} onChange={(event) => setUnitId(event.target.value)}>
                  {(options?.units ?? []).some((unit) => unit.id === unitId) ? null : <option value={unitId}>{t("problems.article.currentUnit")}</option>}
                  {(options?.units ?? []).map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {error !== null ? (
              <p role="alert" className={errorTextClassName}>
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
                {t("ui.cancel")}
              </Button>
              <Button type="submit" variant="primary" disabled={!canSubmit} data-testid="problem-article-submit">
                {pending ? t("ui.loading") : t("problems.article.submit")}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

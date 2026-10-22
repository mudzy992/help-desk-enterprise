import type { Dispatch, SetStateAction } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ScopeOption } from "@/components/templates/scope-multi-select";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  blankPlaybookStep,
  type PlaybookStepDraft,
  withCurrentScopeOption,
} from "@/lib/templates/playbook-editor-model";
import { moveItem } from "@/lib/templates/reorder-steps";
import { cn } from "@/lib/utils";

export function PlaybookStepsEditor({
  steps,
  setSteps,
  updateStep,
  articles,
  templates,
  canEdit,
  disabled,
  version,
  activeTickets,
  dragIndex,
  setDragIndex,
}: {
  readonly steps: readonly PlaybookStepDraft[];
  readonly setSteps: Dispatch<SetStateAction<readonly PlaybookStepDraft[]>>;
  readonly updateStep: (index: number, patch: Partial<PlaybookStepDraft>) => void;
  readonly articles: readonly ScopeOption[];
  readonly templates: readonly ScopeOption[];
  readonly canEdit: boolean;
  readonly disabled: boolean;
  readonly version: number | null;
  readonly activeTickets: number;
  readonly dragIndex: number | null;
  readonly setDragIndex: Dispatch<SetStateAction<number | null>>;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader
        title={t("templates.playbook.steps")}
        subtitle={
          version !== null
            ? `${t("templates.playbook.versionNote", { version })} ${t("templates.playbook.activeTickets", { count: activeTickets })}`
            : undefined
        }
        actions={
          canEdit ? (
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() => setSteps((current) => [...current, blankPlaybookStep()])}
              disabled={disabled || steps.length >= 50}
              data-testid="playbook-add-step"
            >
              <Plus size={12} /> {t("templates.playbook.addStep")}
            </Button>
          ) : null
        }
      />
      <ol className="space-y-3 p-4">
        {steps.map((step, index) => (
          <li
            key={step.uid}
            onDragOver={(event) => {
              if (dragIndex !== null) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragIndex !== null) setSteps((current) => moveItem(current, dragIndex, index));
              setDragIndex(null);
            }}
            className={cn(
              "rounded-lg border border-border bg-surface p-3",
              dragIndex === index && "opacity-50",
            )}
            data-testid="playbook-step"
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                draggable={canEdit}
                onDragStart={(event) => {
                  setDragIndex(index);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDragIndex(null)}
                title={t("templates.playbook.dragHandle")}
                aria-hidden="true"
                className={cn("text-muted-foreground", canEdit && "cursor-grab")}
              >
                <GripVertical size={14} />
              </span>
              <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("templates.playbook.stepNumber", { number: index + 1 })}
              </span>
              {canEdit ? (
                <div className="ml-auto flex items-center gap-0.5">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t("templates.playbook.moveUp")}
                    disabled={disabled || index === 0}
                    onClick={() => setSteps((current) => moveItem(current, index, index - 1))}
                  >
                    <ArrowUp size={13} />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t("templates.playbook.moveDown")}
                    disabled={disabled || index === steps.length - 1}
                    onClick={() => setSteps((current) => moveItem(current, index, index + 1))}
                  >
                    <ArrowDown size={13} />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t("templates.playbook.removeStep")}
                    disabled={disabled || steps.length === 1}
                    onClick={() =>
                      setSteps((current) => current.filter((_, position) => position !== index))
                    }
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label={t("templates.playbook.stepTitle")} required>
                  {(control) => (
                    <Input
                      {...control}
                      value={step.title}
                      onChange={(event) => updateStep(index, { title: event.target.value })}
                      maxLength={200}
                      disabled={disabled}
                      data-testid={`playbook-step-title-${index + 1}`}
                    />
                  )}
                </Field>
                <div className="pb-2">
                  <Checkbox
                    checked={step.required}
                    onChange={(event) => updateStep(index, { required: event.target.checked })}
                    disabled={disabled}
                    data-testid={`playbook-step-required-${index + 1}`}
                    label={
                      <span className="text-[12.5px]">{t("templates.playbook.stepRequired")}</span>
                    }
                  />
                </div>
              </div>
              <Field label={t("templates.playbook.stepInstructions")}>
                {(control) => (
                  <Textarea
                    {...control}
                    value={step.instructions}
                    onChange={(event) => updateStep(index, { instructions: event.target.value })}
                    rows={2}
                    maxLength={4000}
                    disabled={disabled}
                  />
                )}
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t("templates.playbook.stepArticle")}>
                  {(control) => (
                    <Select
                      {...control}
                      value={step.knowledgeArticleId}
                      onChange={(event) =>
                        updateStep(index, { knowledgeArticleId: event.target.value })
                      }
                      disabled={disabled}
                    >
                      <option value="">{t("templates.playbook.stepArticleNone")}</option>
                      {withCurrentScopeOption(articles, step.knowledgeArticleId).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t("templates.playbook.stepTemplate")}>
                  {(control) => (
                    <Select
                      {...control}
                      value={step.responseTemplateId}
                      onChange={(event) =>
                        updateStep(index, { responseTemplateId: event.target.value })
                      }
                      disabled={disabled}
                    >
                      <option value="">{t("templates.playbook.stepTemplateNone")}</option>
                      {withCurrentScopeOption(templates, step.responseTemplateId).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

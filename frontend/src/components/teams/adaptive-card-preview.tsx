import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select, Textarea, Input } from "@/components/ui/field";
import { mergeActionData, parseCardText } from "@/lib/teams/adaptive-card-text";
import { cn } from "@/lib/utils";

type CardNode = Readonly<Record<string, unknown>>;

export type AdaptiveCardAction = {
  readonly verb: string;
  readonly data: Record<string, unknown>;
};

interface AdaptiveCardPreviewProperties {
  readonly card: CardNode;
  readonly disabled?: boolean;
  readonly onAction: (action: AdaptiveCardAction) => void;
}

const asNodes = (value: unknown): readonly CardNode[] =>
  Array.isArray(value) ? value.filter((item): item is CardNode => typeof item === "object" && item !== null) : [];
const asText = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * Paket 3.1 (§16): renders the Adaptive Card subset the connector sends
 * (TextBlock, FactSet, ColumnSet, Container, ActionSet, Input.Text, Input.ChoiceSet,
 * Action.Execute/Submit/OpenUrl/ShowCard) with the design system — a
 * faithful-enough preview for the simulator, not a general renderer.
 */
export function AdaptiveCardPreview({ card, disabled = false, onAction }: AdaptiveCardPreviewProperties) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [openCard, setOpenCard] = useState<number | null>(null);

  const setInput = (id: string, value: string) => setInputs((current) => ({ ...current, [id]: value }));

  const renderElement = (node: CardNode, key: string): ReactNode => {
    switch (node.type) {
      case "TextBlock": {
        const color = node.color === "Attention" ? "text-danger" : node.color === "Good" ? "text-ok" : node.color === "Warning" ? "text-warning" : node.color === "Accent" ? "text-link" : "text-foreground";
        return (
          <p
            key={key}
            className={cn(
              "whitespace-pre-wrap break-words leading-5",
              node.size === "Medium" || node.size === "Large" ? "text-[14px]" : "text-[12.5px]",
              node.weight === "Bolder" ? "font-semibold" : null,
              node.isSubtle === true ? "text-muted-foreground" : color,
            )}
          >
            {parseCardText(asText(node.text)).map((segment, index) =>
              segment.bold ? <strong key={index}>{segment.text}</strong> : <span key={index}>{segment.text}</span>,
            )}
          </p>
        );
      }
      case "FactSet":
        return (
          <dl key={key} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
            {asNodes(node.facts).map((fact, index) => (
              <div key={index} className="contents">
                <dt className="text-muted-foreground">{asText(fact.title)}</dt>
                <dd className="text-foreground">{parseCardText(asText(fact.value)).map((segment) => segment.text).join("")}</dd>
              </div>
            ))}
          </dl>
        );
      case "ColumnSet":
        return (
          <div key={key} className="grid gap-2 sm:grid-flow-col sm:auto-cols-fr">
            {asNodes(node.columns).map((column, index) => (
              <div key={index} className="space-y-2">
                {asNodes(column.items).map((item, itemIndex) => renderElement(item, `${key}-${index}-${itemIndex}`))}
              </div>
            ))}
          </div>
        );
      case "Container": {
        const select = node.selectAction as CardNode | undefined;
        return (
          <div key={key} className={cn("space-y-1", node.separator === true ? "border-t border-border pt-2" : null)}>
            {asNodes(node.items).map((item, index) => renderElement(item, `${key}-${index}`))}
            {select?.type === "Action.OpenUrl" ? (
              <a className="text-[11.5px] text-link hover:underline" href={asText(select.url)} target="_blank" rel="noreferrer">
                {asText(select.title)}
              </a>
            ) : null}
          </div>
        );
      }
      case "ActionSet":
        return <div key={key}>{renderActions(asNodes(node.actions), [], `a${key}`)}</div>;
      case "Input.Text": {
        const id = asText(node.id);
        const label = asText(node.label) || asText(node.placeholder) || id;
        const value = inputs[id] ?? asText(node.value);
        return (
          <label key={key} className="grid gap-1 text-[12px] font-medium text-foreground">
            {label}
            {node.isMultiline === true ? (
              <Textarea rows={3} value={value} placeholder={asText(node.placeholder)} onChange={(event) => setInput(id, event.target.value)} disabled={disabled} />
            ) : (
              <Input value={value} placeholder={asText(node.placeholder)} onChange={(event) => setInput(id, event.target.value)} disabled={disabled} />
            )}
          </label>
        );
      }
      case "Input.ChoiceSet": {
        const id = asText(node.id);
        const choices = asNodes(node.choices);
        const value = inputs[id] ?? asText(node.value);
        return (
          <label key={key} className="grid gap-1 text-[12px] font-medium text-foreground">
            {asText(node.label) || id}
            <Select value={value} onChange={(event) => setInput(id, event.target.value)} disabled={disabled}>
              <option value="">{asText(node.placeholder) || "—"}</option>
              {choices.map((choice) => (
                <option key={asText(choice.value)} value={asText(choice.value)}>
                  {asText(choice.title)}
                </option>
              ))}
            </Select>
          </label>
        );
      }
      default:
        return null;
    }
  };

  /** Defaults of all inputs (also of inputs never touched) in this card. */
  const collectDefaults = (nodes: readonly CardNode[], into: Record<string, string>) => {
    for (const node of nodes) {
      if ((node.type === "Input.Text" || node.type === "Input.ChoiceSet") && asText(node.id)) into[asText(node.id)] = asText(node.value);
      collectDefaults(asNodes(node.items), into);
      for (const column of asNodes(node.columns)) collectDefaults(asNodes(column.items), into);
    }
    return into;
  };

  const renderActions = (actions: readonly CardNode[], scope: readonly CardNode[], prefix: string): ReactNode => {
    if (actions.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-2 pt-1">
        {actions.map((action, index) => {
          const title = asText(action.title);
          if (action.type === "Action.OpenUrl") {
            return (
              <a key={index} className="inline-flex h-[26px] items-center rounded-md border border-border px-2 text-[11.5px] text-link hover:bg-surface-hover" href={asText(action.url)} target="_blank" rel="noreferrer">
                {title}
              </a>
            );
          }
          if (action.type === "Action.ShowCard") {
            const marker = Number(`${prefix.length}${index}`);
            return (
              <Button key={index} size="xs" variant={openCard === marker ? "secondary" : "outline"} disabled={disabled} onClick={() => setOpenCard(openCard === marker ? null : marker)}>
                {title}
              </Button>
            );
          }
          const data = action.data as Record<string, unknown> | undefined;
          const verb = action.type === "Action.Execute" ? asText(action.verb) : asText(data?.verb);
          return (
            <Button
              key={index}
              size="xs"
              variant={action.style === "destructive" ? "danger" : action.style === "positive" ? "primary" : "outline"}
              disabled={disabled || !verb}
              onClick={() => onAction({ verb, data: mergeActionData(data, { ...collectDefaults(scope, {}), ...inputs }) })}
            >
              {title}
            </Button>
          );
        })}
      </div>
    );
  };

  const body = asNodes(card.body);
  const actions = asNodes(card.actions);
  const shown = actions.find((action, index) => action.type === "Action.ShowCard" && openCard === Number(`0${index}`));
  const shownCard = shown?.card as CardNode | undefined;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface px-3 py-3 shadow-sm">
      {body.map((node, index) => renderElement(node, String(index)))}
      {renderActions(actions, body, "")}
      {shownCard ? (
        <div className="space-y-2 border-t border-border pt-2">
          {asNodes(shownCard.body).map((node, index) => renderElement(node, `s${index}`))}
          {renderActions(asNodes(shownCard.actions), [...body, ...asNodes(shownCard.body)], "s")}
        </div>
      ) : null}
    </div>
  );
}

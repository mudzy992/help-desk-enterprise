import { AlertTriangle, FileText, Search, User } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  controlCompactClassName,
  floatingPanelClassName,
  selectCompactClassName,
} from "@/components/ui/control";
import { Kbd } from "@/components/ui/kbd";
import { flattenPickerGroups, groupPickerItems } from "@/lib/templates/group-picker-items";
import { mapTemplatesError, type TemplatesErrorKey } from "@/lib/templates/map-templates-error";
import { cn } from "@/lib/utils";
import {
  listPickerTemplates,
  renderTicketTemplate,
  type RenderedTemplate,
  type ResponseTemplatePickerItem,
  type TemplateLocale,
} from "@/services/templates-api";

type LocaleChoice = "auto" | TemplateLocale;

export type InsertedTemplate = {
  readonly templateId: string;
  readonly name: string;
  readonly rendered: RenderedTemplate;
};

interface TemplatePickerProperties {
  readonly ticketId: string;
  readonly kind: "REPLY" | "INTERNAL";
  readonly onClose: () => void;
  readonly onInsert: (inserted: InsertedTemplate) => void;
}

/**
 * Paket 1.4 (T5): popover picker. Loads the list once per open (so another
 * admin's change shows up next time — A5), filters locally, previews the
 * highlighted template filled for this ticket, and inserts on Enter.
 */
export function TemplatePicker({ ticketId, kind, onClose, onInsert }: TemplatePickerProperties) {
  const { t } = useTranslation();
  const listId = useId();
  const [items, setItems] = useState<readonly ResponseTemplatePickerItem[] | null>(null);
  const [errorKey, setErrorKey] = useState<TemplatesErrorKey | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [locale, setLocale] = useState<LocaleChoice>("auto");
  const [highlight, setHighlight] = useState(0);
  const [previews, setPreviews] = useState<ReadonlyMap<string, RenderedTemplate>>(new Map());
  const [isInserting, setIsInserting] = useState(false);
  const searchReference = useRef<HTMLInputElement>(null);
  const panelReference = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setItems(null);
    listPickerTemplates({ ticketId, kind, all: showAll })
      .then((response) => {
        if (active) {
          setItems(response);
          setErrorKey(null);
        }
      })
      .catch((error: unknown) => {
        if (active) setErrorKey(mapTemplatesError(error));
      });
    return () => {
      active = false;
    };
  }, [kind, showAll, ticketId]);

  useEffect(() => {
    searchReference.current?.focus();
  }, []);

  // Close on outside click.
  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (panelReference.current !== null && !panelReference.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [onClose]);

  const groups = useMemo(() => groupPickerItems(items ?? [], query), [items, query]);
  const flat = useMemo(() => flattenPickerGroups(groups), [groups]);
  const current = flat[Math.min(highlight, Math.max(flat.length - 1, 0))] ?? null;

  useEffect(() => {
    setHighlight(0);
  }, [query, showAll]);

  const previewKey = (id: string) => `${id}:${locale}`;

  const render = useCallback(
    async (item: ResponseTemplatePickerItem): Promise<RenderedTemplate> => {
      const cached = previews.get(`${item.id}:${locale}`);
      if (cached !== undefined) return cached;
      const rendered = await renderTicketTemplate(ticketId, item.id, locale === "auto" ? undefined : locale);
      setPreviews((map) => new Map(map).set(`${item.id}:${locale}`, rendered));
      return rendered;
    },
    [locale, previews, ticketId],
  );

  // Debounced preview of the highlighted template.
  useEffect(() => {
    if (current === null || previews.has(previewKey(current.id))) return;
    const timer = window.setTimeout(() => {
      void render(current).catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, locale]);

  const insert = async (item: ResponseTemplatePickerItem) => {
    setIsInserting(true);
    try {
      const rendered = await render(item);
      onInsert({ templateId: item.id, name: item.name, rendered });
    } catch (error) {
      setErrorKey(mapTemplatesError(error));
    } finally {
      setIsInserting(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, Math.max(flat.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && current !== null && !isInserting) {
      event.preventDefault();
      void insert(current);
    }
  };

  const preview = current === null ? undefined : previews.get(previewKey(current.id));

  return (
    <div
      ref={panelReference}
      role="dialog"
      aria-label={t("templates.picker.button")}
      data-testid="template-picker"
      onKeyDown={onKeyDown}
      className={cn(floatingPanelClassName, "absolute bottom-full left-0 z-40 mb-2 w-[min(720px,calc(100vw-2rem))]")}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 p-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchReference}
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={current === null ? undefined : `${listId}-${current.id}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("templates.picker.search")}
            className={cn(controlCompactClassName, "pl-7")}
            data-testid="template-picker-search"
          />
        </div>
        <select
          value={locale}
          onChange={(event) => setLocale(event.target.value as LocaleChoice)}
          aria-label={t("templates.picker.locale")}
          className={cn(selectCompactClassName, "w-auto")}
        >
          <option value="auto">{t("templates.picker.localeAuto")}</option>
          <option value="bs">BS</option>
          <option value="en">EN</option>
        </select>
        <Checkbox
          checked={showAll}
          onChange={(event) => setShowAll(event.target.checked)}
          label={<span className="text-[12px] text-muted-foreground">{t("templates.picker.showAll")}</span>}
        />
      </div>
      {errorKey !== null ? (
        <p role="alert" className="px-3 py-2 text-[12.5px] text-danger">
          {t(errorKey)}
        </p>
      ) : null}
      <div className="grid max-h-[340px] grid-cols-1 sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <ul id={listId} role="listbox" className="max-h-[340px] overflow-y-auto border-border/70 py-1 sm:border-r">
          {items === null && errorKey === null ? (
            <li className="px-3 py-2 text-[12.5px] text-muted-foreground">{t("templates.picker.loading")}</li>
          ) : flat.length === 0 ? (
            <li className="px-3 py-2 text-[12.5px] text-muted-foreground">{t("templates.picker.empty")}</li>
          ) : (
            groups.map((group) => (
              <li key={group.section} role="presentation">
                <p className="px-3 pb-0.5 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`templates.picker.sections.${group.section}`)}
                </p>
                <ul role="presentation">
                  {group.items.map((item) => {
                    const active = current?.id === item.id;
                    return (
                      <li
                        key={item.id}
                        id={`${listId}-${item.id}`}
                        role="option"
                        aria-selected={active}
                        data-testid="template-picker-item"
                        onMouseEnter={() => setHighlight(flat.indexOf(item))}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => void insert(item)}
                        className={cn(
                          "mx-1 cursor-pointer rounded-md px-2 py-1.5",
                          active ? "bg-primary/10" : "hover:bg-surface-hover",
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          {item.ownership === "personal" ? (
                            <User size={12} className="shrink-0 text-muted-foreground" />
                          ) : (
                            <FileText size={12} className="shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate text-[12.5px] font-medium text-foreground">{item.name}</span>
                          {item.hasEnglish ? (
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                              {t("templates.picker.hasEnglish")}
                            </span>
                          ) : null}
                        </div>
                        {item.tags.length > 0 ? (
                          <p className="mt-0.5 truncate pl-[18px] text-[11px] text-muted-foreground">
                            {item.tags.map((tag) => `#${tag}`).join(" ")}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
        <div className="hidden min-h-[160px] flex-col p-3 sm:flex" aria-live="polite">
          {current === null ? null : (
            <>
              <div className="mb-2 flex items-center gap-2">
                <span className="truncate text-[12.5px] font-semibold text-foreground">{current.name}</span>
                {current.ownership === "personal" ? <Badge>{t("templates.picker.personal")}</Badge> : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/70 bg-elevated/40 p-2.5 text-[12.5px] leading-relaxed text-foreground/95">
                {preview?.text ?? current.preview}
              </div>
              {preview !== undefined && preview.missing.length > 0 ? (
                <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-warning">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {t("templates.picker.missing", {
                    names: preview.missing.map((name) => t(`templates.variable.${name}`)).join(", "),
                  })}
                </p>
              ) : null}
              <div className="mt-2 flex items-center justify-end">
                <Button type="button" size="xs" disabled={isInserting} onClick={() => void insert(current)}>
                  {isInserting ? t("templates.picker.inserting") : t("templates.picker.insert")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 border-t border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        <Kbd>Enter</Kbd>
        <Kbd>Esc</Kbd>
        <span className="ml-1">{t("templates.picker.keyboardHint")}</span>
      </div>
    </div>
  );
}

import { Archive, Pencil, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { KnowledgeCategoryIcon } from "@/components/knowledge-base/portal/knowledge-category-icon";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import {
  buildKnowledgeCategoryTree,
  knowledgeCategoryIconNames,
  knowledgeCategoryName,
  suggestCategoryKey,
} from "@/lib/knowledge-base/knowledge-portal";
import {
  mapKnowledgeArticleError,
  type KnowledgeArticleErrorKey,
} from "@/lib/knowledge-base/map-knowledge-article-error";
import {
  createKnowledgeCategory,
  listKnowledgeCategories,
  setKnowledgeCategoryArchived,
  updateKnowledgeCategory,
  type KnowledgeCategory,
} from "@/services/knowledge-portal-api";

interface KnowledgeCategoriesManagerProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void> | void;
}

type Draft = {
  readonly id: string | null;
  readonly key: string;
  readonly nameBs: string;
  readonly nameEn: string;
  readonly icon: string;
  readonly sortOrder: string;
  readonly parentId: string;
  readonly keyTouched: boolean;
};

const emptyDraft: Draft = {
  id: null,
  key: "",
  nameBs: "",
  nameEn: "",
  icon: "book-open",
  sortOrder: "0",
  parentId: "",
  keyTouched: false,
};

/** Paket 2.9 (K1a): category administration (knowledge.category.manage). */
export function KnowledgeCategoriesManager({ open, onOpenChange, onChanged }: KnowledgeCategoriesManagerProperties) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [categories, setCategories] = useState<readonly KnowledgeCategory[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errorKey, setErrorKey] = useState<KnowledgeArticleErrorKey | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setCategories(await listKnowledgeCategories(true));
    } catch (error) {
      setErrorKey(mapKnowledgeArticleError(error));
    }
  }, []);

  useEffect(() => {
    if (open) {
      setDraft(emptyDraft);
      setErrorKey(null);
      void load();
    }
  }, [open, load]);

  const tree = useMemo(() => buildKnowledgeCategoryTree(categories), [categories]);
  const parentOptions = categories.filter(
    (category) => category.parentId === null && !category.isArchived && category.id !== draft.id,
  );
  const draftHasChildren = draft.id !== null && categories.some((category) => category.parentId === draft.id);
  const sortOrder = Number(draft.sortOrder);
  const canSave =
    draft.nameBs.trim().length > 0 &&
    draft.nameEn.trim().length > 0 &&
    /^[a-z0-9][a-z0-9-]{0,63}$/.test(draft.key) &&
    Number.isInteger(sortOrder) &&
    sortOrder >= 0 &&
    sortOrder <= 9999;

  const refresh = async () => {
    await load();
    await onChanged();
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    setErrorKey(null);
    const input = {
      key: draft.key,
      nameBs: draft.nameBs.trim(),
      nameEn: draft.nameEn.trim(),
      icon: draft.icon,
      sortOrder,
      parentId: draft.parentId === "" ? null : draft.parentId,
    };
    try {
      if (draft.id === null) {
        await createKnowledgeCategory(input);
      } else {
        await updateKnowledgeCategory(draft.id, input);
      }
      toast({ tone: "success", title: t("knowledgeBase.portal.categories.saved") });
      setDraft(emptyDraft);
      await refresh();
    } catch (error) {
      setErrorKey(mapKnowledgeArticleError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleArchived = async (category: KnowledgeCategory) => {
    setErrorKey(null);
    try {
      await setKnowledgeCategoryArchived(category.id, !category.isArchived);
      await refresh();
    } catch (error) {
      setErrorKey(mapKnowledgeArticleError(error));
    }
  };

  const edit = (category: KnowledgeCategory) =>
    setDraft({
      id: category.id,
      key: category.key,
      nameBs: category.nameBs,
      nameEn: category.nameEn,
      icon: category.icon,
      sortOrder: String(category.sortOrder),
      parentId: category.parentId ?? "",
      keyTouched: true,
    });

  const row = (category: KnowledgeCategory, nested: boolean) => (
    <li
      key={category.id}
      className={`flex items-center gap-2 rounded-md border border-border/70 px-2.5 py-1.5 ${nested ? "ml-6" : ""}`}
    >
      <span className="text-muted-foreground">
        <KnowledgeCategoryIcon name={category.icon} size={14} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
        {knowledgeCategoryName(category, i18n.language)}
        <span className="ml-1.5 text-[11px] text-muted-foreground">{category.key}</span>
      </span>
      {category.isArchived ? <Badge tone="neutral">{t("knowledgeBase.portal.categories.archived")}</Badge> : null}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={t("knowledgeBase.portal.categories.edit", { name: knowledgeCategoryName(category, i18n.language) })}
        onClick={() => edit(category)}
      >
        <Pencil size={13} aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={t(
          category.isArchived ? "knowledgeBase.portal.categories.restore" : "knowledgeBase.portal.categories.archive",
          { name: knowledgeCategoryName(category, i18n.language) },
        )}
        onClick={() => void toggleArchived(category)}
      >
        {category.isArchived ? <RotateCcw size={13} aria-hidden="true" /> : <Archive size={13} aria-hidden="true" />}
      </Button>
    </li>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-lg flex-col overflow-y-auto p-5">
        <SheetTitle>{t("knowledgeBase.portal.categories.title")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("knowledgeBase.portal.categories.hint")}
        </SheetDescription>

        <ul className="mt-4 grid gap-1.5" data-testid="knowledge-category-list">
          {tree.length === 0 ? (
            <li className="text-[12px] text-muted-foreground">{t("knowledgeBase.portal.categories.none")}</li>
          ) : (
            tree.flatMap((node) => [row(node, false), ...node.children.map((child) => row(child, true))])
          )}
        </ul>

        <form className="mt-5 grid gap-3 border-t border-border/70 pt-4" onSubmit={onSubmit}>
          <h3 className="text-[13px] font-semibold text-foreground">
            {draft.id === null
              ? t("knowledgeBase.portal.categories.createHeading")
              : t("knowledgeBase.portal.categories.editHeading")}
          </h3>
          <Field label={t("knowledgeBase.portal.categories.nameBs")} required>
            <Input
              value={draft.nameBs}
              maxLength={80}
              required
              onChange={(event) =>
                setDraft({
                  ...draft,
                  nameBs: event.target.value,
                  key: draft.keyTouched ? draft.key : suggestCategoryKey(event.target.value),
                })
              }
            />
          </Field>
          <Field label={t("knowledgeBase.portal.categories.nameEn")} required>
            <Input
              value={draft.nameEn}
              maxLength={80}
              required
              onChange={(event) => setDraft({ ...draft, nameEn: event.target.value })}
            />
          </Field>
          <Field label={t("knowledgeBase.portal.categories.key")} hint={t("knowledgeBase.portal.categories.keyHint")} required>
            <Input
              value={draft.key}
              maxLength={64}
              required
              onChange={(event) => setDraft({ ...draft, key: event.target.value.toLowerCase(), keyTouched: true })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("knowledgeBase.portal.categories.icon")}>
              <Select value={draft.icon} onChange={(event) => setDraft({ ...draft, icon: event.target.value })}>
                {knowledgeCategoryIconNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("knowledgeBase.portal.categories.sortOrder")}>
              <Input
                type="number"
                min={0}
                max={9999}
                value={draft.sortOrder}
                onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
              />
            </Field>
          </div>
          <Field
            label={t("knowledgeBase.portal.categories.parent")}
            hint={draftHasChildren ? t("knowledgeBase.portal.categories.parentLocked") : undefined}
          >
            <Select
              value={draft.parentId}
              disabled={draftHasChildren}
              onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}
            >
              <option value="">{t("knowledgeBase.portal.categories.noParent")}</option>
              {parentOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {knowledgeCategoryName(category, i18n.language)}
                </option>
              ))}
            </Select>
          </Field>
          {errorKey ? <ApiErrorText messageKey={errorKey} /> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" disabled={!canSave || isSaving}>
              {isSaving ? t("knowledgeBase.saving") : t("knowledgeBase.portal.categories.save")}
            </Button>
            {draft.id !== null ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(emptyDraft)}>
                {t("ui.cancel")}
              </Button>
            ) : null}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

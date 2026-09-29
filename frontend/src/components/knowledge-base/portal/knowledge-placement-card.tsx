import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { buildKnowledgeCategoryTree, knowledgeCategoryName } from "@/lib/knowledge-base/knowledge-portal";
import {
  mapKnowledgeArticleError,
  type KnowledgeArticleErrorKey,
} from "@/lib/knowledge-base/map-knowledge-article-error";
import type { KnowledgeArticleResponse } from "@/services/knowledge-base-api";
import {
  listKnowledgeCategories,
  placeKnowledgeArticle,
  type KnowledgeCategory,
} from "@/services/knowledge-portal-api";

interface KnowledgePlacementCardProperties {
  readonly article: KnowledgeArticleResponse;
  readonly onChanged: () => Promise<void>;
}

/**
 * Paket 2.9 (K1a): category and FAQ placement of an article. Shown to curators
 * (writer, reviewer or publisher); the backend checks the article scope.
 * Placement does not send a published article back to review.
 */
export function KnowledgePlacementCard({ article, onChanged }: KnowledgePlacementCardProperties) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [categories, setCategories] = useState<readonly KnowledgeCategory[]>([]);
  const [categoryId, setCategoryId] = useState(article.categoryId ?? "");
  const [isFaq, setIsFaq] = useState(article.isFaq === true);
  const [faqOrder, setFaqOrder] = useState(article.faqOrder === null || article.faqOrder === undefined ? "" : String(article.faqOrder));
  const [reason, setReason] = useState("");
  const [errorKey, setErrorKey] = useState<KnowledgeArticleErrorKey | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listKnowledgeCategories()
      .then((loaded) => {
        if (!cancelled) setCategories(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(
    () =>
      buildKnowledgeCategoryTree(categories).flatMap((node) => [
        { id: node.id, label: knowledgeCategoryName(node, i18n.language) },
        ...node.children.map((child) => ({
          id: child.id,
          label: `${knowledgeCategoryName(node, i18n.language)} › ${knowledgeCategoryName(child, i18n.language)}`,
        })),
      ]),
    [categories, i18n.language],
  );

  const order = faqOrder.trim() === "" ? null : Number(faqOrder);
  const orderValid = order === null || (Number.isInteger(order) && order >= 0 && order <= 999);
  const changed =
    categoryId !== (article.categoryId ?? "") ||
    isFaq !== (article.isFaq === true) ||
    (isFaq && order !== (article.faqOrder ?? null));
  const canSave = changed && orderValid && reason.trim().length > 0;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    setErrorKey(null);
    try {
      await placeKnowledgeArticle(article.id, {
        categoryId: categoryId === "" ? null : categoryId,
        isFaq,
        faqOrder: isFaq ? order : null,
        reason: reason.trim(),
      });
      toast({ tone: "success", title: t("knowledgeBase.portal.placement.saved") });
      setReason("");
      await onChanged();
    } catch (error) {
      setErrorKey(mapKnowledgeArticleError(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="grid gap-3 border-t border-border/70 px-4 py-3" onSubmit={onSubmit} data-testid="knowledge-placement">
      <h3 className="text-[12.5px] font-semibold text-foreground">{t("knowledgeBase.portal.placement.title")}</h3>
      <Field label={t("knowledgeBase.portal.placement.category")}>
        <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">{t("knowledgeBase.portal.uncategorized")}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-[12.5px] text-foreground">
        <Switch checked={isFaq} onCheckedChange={setIsFaq} aria-label={t("knowledgeBase.portal.placement.faq")} />
        {t("knowledgeBase.portal.placement.faq")}
      </label>
      {isFaq ? (
        <Field
          label={t("knowledgeBase.portal.placement.faqOrder")}
          hint={t("knowledgeBase.portal.placement.faqOrderHint")}
          error={orderValid ? undefined : t("knowledgeBase.portal.placement.faqOrderInvalid")}
        >
          <Input
            type="number"
            min={0}
            max={999}
            value={faqOrder}
            onChange={(event) => setFaqOrder(event.target.value)}
          />
        </Field>
      ) : null}
      <Field label={t("knowledgeBase.reason")} required>
        <Input value={reason} maxLength={512} onChange={(event) => setReason(event.target.value)} />
      </Field>
      {errorKey ? <ApiErrorText messageKey={errorKey} /> : null}
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={!canSave || isSaving}>
          {isSaving ? t("knowledgeBase.saving") : t("knowledgeBase.portal.placement.save")}
        </Button>
      </div>
    </form>
  );
}

import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  buildKnowledgeCategoryTree,
  knowledgeCategoryName,
  totalReplacements,
} from "@/lib/knowledge-base/knowledge-portal";
import {
  mapKnowledgeArticleError,
  type KnowledgeArticleErrorKey,
} from "@/lib/knowledge-base/map-knowledge-article-error";
import { readApiRequestId } from "@/lib/map-api-error";
import {
  createKnowledgeArticleFromReply,
  listKnowledgeCategories,
  previewKnowledgeDraftFromReply,
  type KnowledgeCategory,
  type KnowledgeDraftFromReply,
} from "@/services/knowledge-portal-api";

interface ArticleFromReplySheetProperties {
  readonly source: { readonly ticketId: string; readonly messageId: string } | null;
  readonly currentUserId: string | null;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Paket 2.9 (K1c, P2): a public agent reply becomes an article DRAFT. The
 * server replaces personal data first (e-mail, names/logins of the people on
 * the ticket, IP addresses, phone numbers); the agent reviews and edits the
 * text before saving. The article is owned by the agent and starts as DRAFT;
 * the ticket gets an internal note.
 */
export function ArticleFromReplySheet({ source, currentUserId, onOpenChange }: ArticleFromReplySheetProperties) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [draft, setDraft] = useState<KnowledgeDraftFromReply | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [reason, setReason] = useState("");
  const [categories, setCategories] = useState<readonly KnowledgeCategory[]>([]);
  const [errorKey, setErrorKey] = useState<KnowledgeArticleErrorKey | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (source === null) return;
    let cancelled = false;
    setDraft(null);
    setErrorKey(null);
    setRequestId(null);
    setCategoryId("");
    setReason(t("knowledgeBase.portal.fromReply.defaultReason"));
    Promise.all([previewKnowledgeDraftFromReply(source), listKnowledgeCategories().catch(() => [])])
      .then(([preview, loaded]) => {
        if (cancelled) return;
        setDraft(preview);
        setTitle(preview.title);
        setBody(preview.body);
        setCategories(loaded);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorKey(mapKnowledgeArticleError(error));
        setRequestId(readApiRequestId(error));
      });
    return () => {
      cancelled = true;
    };
  }, [source, t]);

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

  const canSave =
    draft !== null && currentUserId !== null && title.trim().length > 0 && body.trim().length > 0 && reason.trim().length > 0;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave || source === null || draft === null || currentUserId === null) return;
    setIsSaving(true);
    setErrorKey(null);
    try {
      const created = await createKnowledgeArticleFromReply({
        ticketId: source.ticketId,
        messageId: source.messageId,
        title: title.trim(),
        body: body.trim(),
        serviceId: draft.serviceId,
        organizationalUnitId: draft.organizationalUnitId,
        ownerUserId: currentUserId,
        categoryId: categoryId === "" ? undefined : categoryId,
        reason: reason.trim(),
      });
      toast({
        tone: "success",
        title: t("knowledgeBase.portal.fromReply.created"),
        description: created.title,
      });
      onOpenChange(false);
    } catch (error) {
      setErrorKey(mapKnowledgeArticleError(error));
      setRequestId(readApiRequestId(error));
    } finally {
      setIsSaving(false);
    }
  };

  const replaced = draft === null ? 0 : totalReplacements(draft.replacements);

  return (
    <Sheet open={source !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-lg flex-col overflow-y-auto p-5">
        <SheetTitle>{t("knowledgeBase.portal.fromReply.title")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("knowledgeBase.portal.fromReply.hint")}
        </SheetDescription>
        {errorKey !== null && draft === null ? (
          <div className="mt-4">
            <ApiErrorText messageKey={errorKey} requestId={requestId} />
          </div>
        ) : draft === null ? (
          <PanelSkeleton className="mt-4" label={t("knowledgeBase.portal.fromReply.title")} />
        ) : (
          <form className="mt-4 grid gap-3" onSubmit={onSubmit} data-testid="article-from-reply-form">
            <div
              role="status"
              className="flex items-start gap-2 rounded-md border border-primary/25 bg-primary/8 px-3 py-2 text-[12px] text-foreground"
            >
              <ShieldCheck size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-link" />
              <span>
                {replaced === 0
                  ? t("knowledgeBase.portal.fromReply.noReplacements")
                  : t("knowledgeBase.portal.fromReply.replacements", {
                      email: draft.replacements.email,
                      person: draft.replacements.person,
                      ip: draft.replacements.ip,
                      phone: draft.replacements.phone,
                    })}{" "}
                {t("knowledgeBase.portal.fromReply.reviewReminder")}
              </span>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              {t("knowledgeBase.portal.fromReply.source")}{" "}
              <Link to={`/tickets/${draft.sourceTicketId}`} className="tnum font-medium text-link hover:underline">
                {draft.ticketNumber}
              </Link>
            </p>
            <Field label={t("knowledgeBase.titleField")} required>
              <Input value={title} maxLength={200} required onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label={t("knowledgeBase.bodyField")} required>
              <Textarea
                value={body}
                maxLength={20000}
                required
                className="min-h-48"
                onChange={(event) => setBody(event.target.value)}
              />
            </Field>
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
            <Field label={t("knowledgeBase.reason")} required>
              <Input value={reason} maxLength={512} required onChange={(event) => setReason(event.target.value)} />
            </Field>
            {errorKey ? <ApiErrorText messageKey={errorKey} requestId={requestId} /> : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="primary" disabled={!canSave || isSaving}>
                {isSaving ? t("knowledgeBase.saving") : t("knowledgeBase.portal.fromReply.save")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                {t("ui.cancel")}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ExternalLink, Save, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { controlClassName, hintClassName, labelClassName } from "@/components/ui/control";
import { Segmented } from "@/components/ui/segmented";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { MarkdownView } from "@/components/privacy/markdown-view";
import { PanelIntro, usePrivacyFailure } from "@/components/privacy/privacy-shared";
import {
  privacyNoticeState,
  privacyNoticeStateTone,
  type PrivacyNoticeState,
} from "@/lib/privacy/privacy-view";
import {
  getPrivacyNoticeDraft,
  getPrivacyNoticeStatus,
  putPrivacyNotice,
  type PrivacyNoticeStatus,
} from "@/services/privacy-api";

const noticeLocales = ["bs", "en"] as const;
type NoticeLocale = (typeof noticeLocales)[number];

const stateLabelKeys: Record<PrivacyNoticeState, "privacy.noticeEditor.statePublished" | "privacy.noticeEditor.stateDraft" | "privacy.noticeEditor.stateDisabled"> = {
  published: "privacy.noticeEditor.statePublished",
  draft: "privacy.noticeEditor.stateDraft",
  disabled: "privacy.noticeEditor.stateDisabled",
};
const editorLabelKeys: Record<NoticeLocale, "privacy.noticeEditor.editorLabelBs" | "privacy.noticeEditor.editorLabelEn"> = {
  bs: "privacy.noticeEditor.editorLabelBs",
  en: "privacy.noticeEditor.editorLabelEn",
};

/**
 * 5.3.7 (§4.7 — privatnost): dedicated editor for the public privacy notice.
 * BS/EN tabs, Markdown with a live preview, a character counter against the
 * backend limit, and "Generate from the record of processing" which fills the
 * editor with the same draft the public page would show. Saving writes both
 * languages through `PUT /privacy/notice`; an empty text returns that language
 * to the generated draft.
 */
export function PrivacyNoticeEditor() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const onFailure = usePrivacyFailure();
  const [status, setStatus] = useState<PrivacyNoticeStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<NoticeLocale>("bs");
  const [drafts, setDrafts] = useState<{ readonly bs: string; readonly en: string }>({ bs: "", en: "" });
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const loaded = await getPrivacyNoticeStatus();
      setStatus(loaded);
      setDrafts({ bs: loaded.notice.bs, en: loaded.notice.en });
    } catch (caught) {
      setFailed(true);
      onFailure(caught);
    }
  }, [onFailure]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return (
      <div data-testid="privacy-notice-editor-failed" className="rounded-lg border border-border bg-surface p-5">
        <p className={`${hintClassName} mb-3`}>{t("privacy.noticeEditor.loadFailed")}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
          {t("privacy.noticeEditor.retry")}
        </Button>
      </div>
    );
  }
  if (status === null) {
    return <PanelSkeleton className="mt-0" label={t("privacy.tabs.notice")} />;
  }

  const maxLength = status.maxLength;
  const activeText = drafts[active];
  const overLimit = activeText.length > maxLength;
  const dirty = drafts.bs !== status.notice.bs || drafts.en !== status.notice.en;
  const state = privacyNoticeState(status.enabled, status.notice[active]);

  const generate = async () => {
    setGenerating(true);
    try {
      const draft = await getPrivacyNoticeDraft(active);
      setDrafts((current) => ({ ...current, [active]: draft.markdown }));
    } catch (caught) {
      onFailure(caught);
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await putPrivacyNotice({ bs: drafts.bs, en: drafts.en });
      setStatus(saved);
      setDrafts({ bs: saved.notice.bs, en: saved.notice.en });
      toast({ title: t("privacy.noticeEditor.saved"), tone: "success" });
    } catch (caught) {
      onFailure(caught);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="privacy-notice-editor">
      <PanelIntro
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link to="/privacy-notice" target="_blank" rel="noopener">
              <ExternalLink size={14} /> {t("privacy.noticeEditor.openPublic")}
            </Link>
          </Button>
        }
      >
        {t("privacy.noticeEditor.intro")}
      </PanelIntro>

      {!status.enabled ? (
        <p
          data-testid="privacy-notice-module-badge"
          className="mb-3 rounded-md border border-danger/30 bg-danger/6 px-3 py-2.5 text-[12.5px] text-danger"
        >
          {t("privacy.noticeEditor.moduleDisabled")}
        </p>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          ariaLabel={t("privacy.noticeEditor.language")}
          value={active}
          onChange={(value) => setActive(value === "en" ? "en" : "bs")}
          items={[
            { value: "bs", label: "BS" },
            { value: "en", label: "EN" },
          ]}
        />
        <Badge data-testid="privacy-notice-state-badge" tone={privacyNoticeStateTone(state)} dot>
          {t(stateLabelKeys[state])}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className={labelClassName} htmlFor="privacy-notice-text">
            <span>{t(editorLabelKeys[active])}</span>
            <textarea
              id="privacy-notice-text"
              data-testid={`privacy-notice-textarea-${active}`}
              className={`${controlClassName} min-h-[320px] font-mono text-[12.5px] leading-5`}
              value={activeText}
              onChange={(event) =>
                setDrafts((current) => ({ ...current, [active]: event.target.value }))
              }
              spellCheck={false}
            />
          </label>
          <p
            data-testid={`privacy-notice-counter-${active}`}
            aria-live="polite"
            className={`tnum mt-1 text-[11.5px] ${overLimit ? "text-danger" : "text-muted-foreground"}`}
          >
            {t("privacy.noticeEditor.chars", { used: activeText.length, total: maxLength })}
            {overLimit ? ` — ${t("privacy.noticeEditor.overLimit")}` : ""}
          </p>
          <div className="mt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="privacy-notice-generate"
              disabled={generating}
              onClick={() => void generate()}
            >
              <Wand2 size={14} /> {t("privacy.noticeEditor.generate")}
            </Button>
          </div>
          <p className={`${hintClassName} mt-1`}>{t("privacy.noticeEditor.generateHint")}</p>
        </div>
        <div>
          <p className="mb-1 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("privacy.noticeEditor.preview")}
          </p>
          <article
            data-testid="privacy-notice-preview"
            className="max-h-[480px] overflow-y-auto rounded-lg border border-border bg-surface p-4 shadow-card"
          >
            <MarkdownView source={activeText} />
          </article>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          data-testid="privacy-notice-save"
          disabled={saving || overLimit || !dirty}
          onClick={() => void save()}
        >
          <Save size={14} /> {t("privacy.noticeEditor.save")}
        </Button>
        {dirty ? <span className="text-[11.5px] text-warning">{t("privacy.noticeEditor.dirty")}</span> : null}
      </div>
    </div>
  );
}

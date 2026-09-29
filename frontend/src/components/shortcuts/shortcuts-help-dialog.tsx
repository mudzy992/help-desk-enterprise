import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Kbd } from "@/components/ui/kbd";
import { Modal, ModalContent, ModalDescription, ModalTitle } from "@/components/ui/modal";
import {
  isSingleKeyShortcut,
  shortcutCatalog,
  type ShortcutContext,
  type ShortcutId,
} from "@/lib/shortcuts/catalog";

interface ShortcutsHelpDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly registeredIds: ReadonlySet<ShortcutId>;
  readonly singleKeysEnabled: boolean;
}

const CONTEXT_ORDER: readonly ShortcutContext[] = ["global", "list", "detail", "editor"];

/** Paket 2.8 §4.2: only the shortcuts valid on this screen for this user. */
export function ShortcutsHelpDialog({ open, onOpenChange, registeredIds, singleKeysEnabled }: ShortcutsHelpDialogProperties) {
  const { t } = useTranslation();
  const visible = shortcutCatalog.filter(
    (item) => registeredIds.has(item.id) && (singleKeysEnabled || !isSingleKeyShortcut(item)),
  );

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-lg" data-testid="shortcuts-help">
        <ModalTitle className="pr-6 text-[14px] font-semibold leading-5 text-foreground">
          {t("a11y.shortcuts.title")}
        </ModalTitle>
        <ModalDescription className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
          {singleKeysEnabled ? t("a11y.shortcuts.descriptionOn") : t("a11y.shortcuts.descriptionOff")}{" "}
          <Link to="/appearance#accessibility" className="text-link underline-offset-2 hover:underline" onClick={() => onOpenChange(false)}>
            {t("a11y.shortcuts.settingsLink")}
          </Link>
        </ModalDescription>
        <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {CONTEXT_ORDER.map((context) => {
            const items = visible.filter((item) => item.context === context);
            if (items.length === 0) return null;
            return (
              <section key={context}>
                <h3 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {t(`a11y.shortcuts.contexts.${context}` as never)}
                </h3>
                <dl className="divide-y divide-border/60 rounded-md border border-border">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <dt className="text-[12.5px] text-foreground">{t(item.descriptionKey as never)}</dt>
                      <dd className="flex shrink-0 items-center gap-1">
                        {item.display.map((label, index) => (
                          <span key={`${label}-${index}`} className="flex items-center gap-1">
                            {index > 0 ? (
                              <span className="text-[11px] text-muted-foreground">
                                {item.sequence.length > 1 ? t("a11y.shortcuts.then") : "+"}
                              </span>
                            ) : null}
                            <Kbd>{label}</Kbd>
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
      </ModalContent>
    </Modal>
  );
}

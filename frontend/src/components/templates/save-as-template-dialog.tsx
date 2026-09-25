import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { mapTemplatesError, type TemplatesErrorKey } from "@/lib/templates/map-templates-error";
import { createResponseTemplate } from "@/services/templates-api";

/** Paket 1.4 (T6): "Save as template" from the composer → personal template. */
export function SaveAsTemplateDialog({
  body,
  kind,
  onClose,
}: {
  readonly body: string;
  readonly kind: "REPLY" | "INTERNAL";
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<TemplatesErrorKey | null>(null);

  const save = async () => {
    setIsSaving(true);
    setErrorKey(null);
    try {
      await createResponseTemplate("personal", { name, bodyBs: body.trim(), kind });
      toast({ tone: "success", title: t("templates.picker.saved") });
      onClose();
    } catch (error) {
      setErrorKey(mapTemplatesError(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal open onOpenChange={(open) => (open ? undefined : onClose())}>
      <ModalContent>
        <ModalHeader title={t("templates.picker.saveAsTitle")} description={t("templates.picker.saveAsHint")} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label={t("templates.picker.saveAsName")} required>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus />
          </Field>
          <p className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/70 bg-elevated/40 p-2 text-[12px] text-muted-foreground">
            {body.trim()}
          </p>
          {errorKey !== null ? (
            <p role="alert" className="mt-2 text-[12.5px] text-danger">
              {t(errorKey)}
            </p>
          ) : null}
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
              {t("templates.editor.cancel")}
            </Button>
            <Button type="submit" disabled={isSaving || name.trim().length < 2}>
              {isSaving ? t("templates.editor.saving") : t("templates.editor.save")}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

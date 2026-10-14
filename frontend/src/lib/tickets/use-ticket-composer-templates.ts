import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { InsertedTemplate } from "@/components/templates/template-picker";
import type {
  ComposerInsertText,
  ComposerTemplatesOptions,
} from "@/components/tickets/ticket-message-composer-types";
import { insertAtCursor } from "@/lib/templates/insert-at-cursor";
import { mapTemplatesError } from "@/lib/templates/map-templates-error";
import type { MessageType } from "@/services/tickets-collaboration-api";
import { renderTicketTemplate } from "@/services/templates-api";

export function useTicketComposerTemplates(input: {
  readonly templates?: ComposerTemplatesOptions;
  readonly insertText: ComposerInsertText | null;
  readonly type: MessageType;
  readonly bodyReference: MutableRefObject<string>;
  readonly textareaReference: MutableRefObject<HTMLTextAreaElement | null>;
  readonly setBody: Dispatch<SetStateAction<string>>;
  readonly setInternal: Dispatch<SetStateAction<boolean>>;
  readonly scheduleFocus: (callback: () => void) => void;
}) {
  const {
    templates,
    insertText,
    bodyReference,
    textareaReference,
    setBody,
    setInternal,
    scheduleFocus,
  } = input;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [usedTemplate, setUsedTemplate] = useState<{
    readonly id: string;
    readonly name: string;
  } | null>(null);
  const [insertErrorKey, setInsertErrorKey] = useState<ReturnType<typeof mapTemplatesError> | null>(
    null,
  );
  const selectionReference = useRef({ start: 0, end: 0 });
  const processedTemplateNonce = useRef<number | null>(null);
  const processedInsertTextNonce = useRef<number | null>(null);

  const openPicker = useCallback(() => {
    const area = textareaReference.current;
    if (area !== null) {
      selectionReference.current = { start: area.selectionStart, end: area.selectionEnd };
    }
    setPickerOpen(true);
  }, [textareaReference]);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    textareaReference.current?.focus();
  }, [textareaReference]);

  const onTemplateInserted = useCallback(
    (inserted: InsertedTemplate) => {
      const { start, end } = selectionReference.current;
      const next = insertAtCursor(bodyReference.current, start, end, inserted.rendered.text);
      setBody(next.value);
      setUsedTemplate({ id: inserted.templateId, name: inserted.name });
      setPickerOpen(false);
      scheduleFocus(() => {
        const area = textareaReference.current;
        if (area !== null) {
          area.focus();
          area.setSelectionRange(next.caret, next.caret);
        }
      });
    },
    [bodyReference, scheduleFocus, setBody, textareaReference],
  );

  const templateTicketId = templates?.ticketId;
  const templateRequest = templates?.insertRequest;
  const templateId = templateRequest?.templateId;
  const templateName = templateRequest?.name;
  const templateNonce = templateRequest?.nonce;

  useEffect(() => {
    if (
      templateTicketId === undefined ||
      templateId === undefined ||
      templateName === undefined ||
      templateNonce === undefined ||
      processedTemplateNonce.current === templateNonce
    ) {
      return;
    }
    processedTemplateNonce.current = templateNonce;
    let active = true;
    const area = textareaReference.current;
    selectionReference.current =
      area === null
        ? { start: bodyReference.current.length, end: bodyReference.current.length }
        : { start: area.selectionStart, end: area.selectionEnd };
    void renderTicketTemplate(templateTicketId, templateId)
      .then((rendered) => {
        if (!active) return;
        setInsertErrorKey(null);
        onTemplateInserted({ templateId, name: templateName, rendered });
      })
      .catch((error: unknown) => {
        if (active) setInsertErrorKey(mapTemplatesError(error));
      });
    return () => {
      active = false;
    };
  }, [
    bodyReference,
    onTemplateInserted,
    templateId,
    templateName,
    templateNonce,
    templateTicketId,
    textareaReference,
  ]);

  useEffect(() => {
    if (insertText === null || processedInsertTextNonce.current === insertText.nonce) return;
    processedInsertTextNonce.current = insertText.nonce;
    const area = textareaReference.current;
    const currentBody = bodyReference.current;
    const start = area === null ? currentBody.length : area.selectionStart;
    const end = area === null ? currentBody.length : area.selectionEnd;
    const next = insertAtCursor(currentBody, start, end, insertText.text);
    setBody(next.value);
    setInternal(false);
    scheduleFocus(() => {
      const target = textareaReference.current;
      if (target !== null) {
        target.focus();
        target.setSelectionRange(next.caret, next.caret);
      }
    });
  }, [bodyReference, insertText, scheduleFocus, setBody, setInternal, textareaReference]);

  return {
    pickerOpen,
    setPickerOpen,
    openPicker,
    closePicker,
    saveAsOpen,
    setSaveAsOpen,
    usedTemplate,
    setUsedTemplate,
    clearUsedTemplate: () => setUsedTemplate(null),
    insertErrorKey,
    onTemplateInserted,
  };
}

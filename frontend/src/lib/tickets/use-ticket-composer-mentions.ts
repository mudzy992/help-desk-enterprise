import {
  useCallback,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  detectMentionQuery,
  insertMentionToken,
  type MentionQuery,
} from "@/lib/tickets/mention-tokens";
import type { MentionCandidate } from "@/services/tickets-agent-collaboration-api";

export function useTicketComposerMentions(input: {
  readonly active: boolean;
  readonly bodyReference: MutableRefObject<string>;
  readonly setBody: Dispatch<SetStateAction<string>>;
  readonly textareaReference: MutableRefObject<HTMLTextAreaElement | null>;
  readonly scheduleFocus: (callback: () => void) => void;
}) {
  const { active, bodyReference, setBody, textareaReference, scheduleFocus } = input;
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<readonly MentionCandidate[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);

  const updateMention = useCallback(
    (value: string, caret: number) => {
      if (!active) {
        setMention(null);
        return;
      }
      const next = detectMentionQuery(value, caret);
      setMention(next);
      if (next === null || next.query !== mention?.query) setMentionIndex(0);
    },
    [active, mention?.query],
  );

  const pickMention = useCallback(
    (candidate: MentionCandidate) => {
      const area = textareaReference.current;
      if (mention === null || area === null) return;
      const next = insertMentionToken(
        bodyReference.current,
        mention,
        area.selectionStart,
        candidate,
      );
      setBody(next.value);
      setMention(null);
      scheduleFocus(() => {
        area.focus();
        area.setSelectionRange(next.caret, next.caret);
      });
    },
    [bodyReference, mention, scheduleFocus, setBody, textareaReference],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!active || mention === null) return false;
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return true;
      }
      if (mentionCandidates.length === 0) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setMentionIndex(
          (current) => (current + step + mentionCandidates.length) % mentionCandidates.length,
        );
        return true;
      }
      if ((event.key === "Enter" || event.key === "Tab") && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        const candidate = mentionCandidates[Math.min(mentionIndex, mentionCandidates.length - 1)];
        if (candidate !== undefined) pickMention(candidate);
        return true;
      }
      return false;
    },
    [active, mention, mentionCandidates, mentionIndex, pickMention],
  );

  return {
    mention,
    mentionCandidates,
    mentionIndex,
    setMentionCandidates,
    dismiss: () => setMention(null),
    updateMention,
    pickMention,
    handleKeyDown,
  };
}

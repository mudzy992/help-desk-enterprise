import { MessageSquareLock, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Segmented, type SegmentedItem } from "@/components/ui/segmented";

type ComposerMode = "reply" | "internal";

export function TicketMessageComposerMode({
  canInternal,
  internal,
  onChange,
}: {
  readonly canInternal: boolean;
  readonly internal: boolean;
  readonly onChange: (internal: boolean) => void;
}) {
  const { t } = useTranslation();
  const items: readonly SegmentedItem<ComposerMode>[] = canInternal
    ? [
        { value: "reply", label: t("tickets.detail.publicReply"), icon: <Send size={12.5} /> },
        {
          value: "internal",
          label: t("tickets.detail.internalNote"),
          icon: <MessageSquareLock size={12.5} />,
        },
      ]
    : [{ value: "reply", label: t("tickets.detail.publicReply"), icon: <Send size={12.5} /> }];

  return (
    <Segmented<ComposerMode>
      size="sm"
      label={t("a11y.conversation.composerMode")}
      value={internal && canInternal ? "internal" : "reply"}
      onChange={(next) => onChange(next === "internal")}
      items={items}
    />
  );
}

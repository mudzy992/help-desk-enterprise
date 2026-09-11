import { useTranslation } from "react-i18next";
import { ticketText } from "@/lib/tickets/ticket-text";

export function useTicketText() {
  const { t: translate, i18n } = useTranslation();
  const t = (key: string, options?: Record<string, string | number>) =>
    ticketText(translate, key, options);
  return { t, i18n };
}

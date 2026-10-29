import type { ParseKeys } from "i18next";

/** Ključevi za tikete moraju postojati u i18next resursu `common`. */
export type TicketTranslationKey = Extract<ParseKeys<"common">, `tickets.${string}`>;

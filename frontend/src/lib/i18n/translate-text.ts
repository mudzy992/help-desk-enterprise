import type { ParseKeys } from "i18next";

export type CommonTranslationKey = Extract<ParseKeys<"common">, string>;

type TextTranslator = (
  key: CommonTranslationKey,
  options?: Readonly<Record<string, string | number>>,
) => unknown;

export function translateText(
  translate: TextTranslator,
  key: CommonTranslationKey,
  options?: Readonly<Record<string, string | number>>,
): string {
  return String(translate(key, options));
}

/** Paket 3.3 (P4, §7): plain-text knowledge article built from a known error. */

export type ProblemArticleLocale = 'bs' | 'en';

const headings: Record<ProblemArticleLocale, { symptoms: string; cause: string; workaround: string; resolution: string; empty: string }> = {
  bs: { symptoms: 'Simptomi', cause: 'Uzrok', workaround: 'Zaobilazno rješenje', resolution: 'Trajno rješenje', empty: '(nije navedeno)' },
  en: { symptoms: 'Symptoms', cause: 'Cause', workaround: 'Workaround', resolution: 'Permanent fix', empty: '(not provided)' },
};

export function buildKnownErrorArticle(
  problem: {
    readonly title: string;
    readonly description: string;
    readonly rootCause: string | null;
    readonly workaround: string | null;
    readonly resolution: string | null;
  },
  locale: ProblemArticleLocale,
): { title: string; body: string } {
  const labels = headings[locale];
  const section = (heading: string, text: string | null) => `${heading}\n${text?.trim() || labels.empty}`;
  const sections = [
    section(labels.symptoms, problem.description),
    section(labels.cause, problem.rootCause),
    section(labels.workaround, problem.workaround),
  ];
  if (problem.resolution?.trim()) sections.push(section(labels.resolution, problem.resolution));
  return { title: problem.title.trim(), body: sections.join('\n\n') };
}

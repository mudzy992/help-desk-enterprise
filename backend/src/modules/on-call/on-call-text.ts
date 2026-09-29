/** Paket 2.9 (K3): notification bodies and iCal text in the recipient's language. */
export type OnCallLocale = 'bs' | 'en';

export function toOnCallLocale(value: string | null | undefined, fallback: string | null | undefined): OnCallLocale {
  const candidate = (value ?? fallback ?? 'bs').toLowerCase();
  return candidate.startsWith('en') ? 'en' : 'bs';
}

export function formatOnCallTime(date: Date, timeZone: string, locale: OnCallLocale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'bs-BA', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

type Params = { readonly group: string; readonly from?: string; readonly to?: string; readonly name?: string; readonly count?: number };

const texts: Record<OnCallLocale, Record<string, (params: Params) => string>> = {
  bs: {
    reminder: (p) => `Sutra si dežuran/na za grupu ${p.group}: ${p.from} – ${p.to}.`,
    shiftStarted: (p) =>
      `Dežurstvo za grupu ${p.group} traje do ${p.to}. Otvorenih tiketa s prekoračenim ili ugroženim SLA: ${p.count ?? 0}.`,
    swapRequested: (p) => `${p.name} traži da preuzmeš dežurstvo za grupu ${p.group}: ${p.from} – ${p.to}.`,
    swapAccepted: (p) => `${p.name} je prihvatio/la zamjenu dežurstva za grupu ${p.group}: ${p.from} – ${p.to}.`,
    swapDeclined: (p) => `${p.name} je odbio/la zamjenu dežurstva za grupu ${p.group}: ${p.from} – ${p.to}.`,
    gap: (p) => `Grupa ${p.group} nema dežurnog od ${p.from} do ${p.to}. Eskalacije idu cijeloj grupi.`,
    icalSummary: (p) => `Dežurstvo: ${p.group}`,
    icalDescription: (p) => `Dežurna smjena za grupu ${p.group}.`,
    icalCalendar: () => 'Moja dežurstva',
  },
  en: {
    reminder: (p) => `You are on call tomorrow for ${p.group}: ${p.from} – ${p.to}.`,
    shiftStarted: (p) =>
      `On call for ${p.group} until ${p.to}. Open tickets with breached or at-risk SLA: ${p.count ?? 0}.`,
    swapRequested: (p) => `${p.name} asks you to take the ${p.group} on-call shift: ${p.from} – ${p.to}.`,
    swapAccepted: (p) => `${p.name} accepted the ${p.group} on-call swap: ${p.from} – ${p.to}.`,
    swapDeclined: (p) => `${p.name} declined the ${p.group} on-call swap: ${p.from} – ${p.to}.`,
    gap: (p) => `${p.group} has nobody on call from ${p.from} to ${p.to}. Escalations go to the whole group.`,
    icalSummary: (p) => `On call: ${p.group}`,
    icalDescription: (p) => `On-call shift for ${p.group}.`,
    icalCalendar: () => 'My on-call shifts',
  },
};

export function onCallText(locale: OnCallLocale, key: keyof (typeof texts)['bs'], params: Params): string {
  return (texts[locale][key] ?? texts.bs[key]!)(params);
}

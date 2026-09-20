export type Locale = 'bs' | 'en';
const storageKey = 'helpdeskLocale';

const messages = {
  bs: {
    subtitle:'Prateći panel', loginEyebrow:'SIGURNA PRIJAVA', loginTitle:'HelpDesk, uvijek pri ruci.', loginDescription:'Pratite svoje tikete, odgovorite korisniku i reagujte kada je potrebna vaša pažnja.',
    api:'API adresa', email:'Email', password:'Lozinka', login:'Prijava', workspaceEyebrow:'RADNI PROSTOR', workspaceTitle:'Moji tiketi',
    tickets:'Otvoreni tiketi', empty:'Trenutno nemate otvorenih tiketa.', openDesk:'Otvori HelpDesk', signOut:'Odjava',
    connected:'Povezan', polling:'Rezervna veza', waiting:'Čeka konekciju', disabled:'Modul nije dostupan', signedOut:'Nije prijavljen',
    actionTitle:'Potrebna je vaša pažnja', actionDescription:'Jedan ili više tiketa zahtijevaju vašu reakciju.', openAction:'Pregledaj',
    replyPlaceholder:'Napišite odgovor korisniku…', replyHint:'Odgovor se šalje direktno na tiket.', send:'Pošalji',
    openTicket:'Otvori tiket u HelpDesk-u', quickAssist:'Quick Assist', quickAssistDescription:'Agent je zatražio udaljenu pomoć za ovaj tiket.', startQuickAssist:'Pokreni Quick Assist',
    noMessages:'Još nema poruka.', language:'Jezik', automatic:'Automatski', bosnian:'Bosanski', english:'English',
    notificationNew:'Novo obavještenje', notificationReply:'Novi odgovor na tiket', notificationAction:'Potrebna je vaša reakcija',
    notificationRemote:'Zahtjev za Quick Assist', notificationGeneric:'Novo obavještenje', notificationMessage:'Tiket {ticket} zahtijeva vašu pažnju.',
    remoteOpened:'Quick Assist je otvoren. Potvrdite zahtjev samo ako očekujete pomoć od svog HelpDesk agenta.',
    loginFailed:'Prijava nije uspjela', requestFailed:'Zahtjev nije uspio', chatDisabled:'Komunikacija je trenutno isključena.'
  },
  en: {
    subtitle:'Companion panel', loginEyebrow:'SECURE SIGN-IN', loginTitle:'HelpDesk, always at hand.', loginDescription:'Track your tickets, reply to customers and act when your attention is required.',
    api:'API address', email:'Email', password:'Password', login:'Sign in', workspaceEyebrow:'WORKSPACE', workspaceTitle:'My tickets',
    tickets:'Open tickets', empty:'You have no open tickets right now.', openDesk:'Open HelpDesk', signOut:'Sign out',
    connected:'Connected', polling:'Fallback connection', waiting:'Waiting for connection', disabled:'Module unavailable', signedOut:'Signed out',
    actionTitle:'Your attention is required', actionDescription:'One or more tickets require your action.', openAction:'Review',
    replyPlaceholder:'Write a reply to the customer…', replyHint:'The reply is posted directly to the ticket.', send:'Send',
    openTicket:'Open ticket in HelpDesk', quickAssist:'Quick Assist', quickAssistDescription:'An agent requested remote assistance for this ticket.', startQuickAssist:'Launch Quick Assist',
    noMessages:'No messages yet.', language:'Language', automatic:'Automatic', bosnian:'Bosnian', english:'English',
    notificationNew:'New notification', notificationReply:'New ticket reply', notificationAction:'Action required',
    notificationRemote:'Quick Assist request', notificationGeneric:'New notification', notificationMessage:'Ticket {ticket} requires your attention.',
    remoteOpened:'Quick Assist has been opened. Only accept if you expected assistance from your HelpDesk agent.',
    loginFailed:'Sign-in failed', requestFailed:'Request failed', chatDisabled:'Communication is currently disabled.'
  }
} as const;

let locale: Locale = 'bs';

function detectLocale(): Locale {
  const lang = navigator.language.toLowerCase();
  return lang.startsWith('bs') || lang.startsWith('hr') || lang.startsWith('sr') ? 'bs' : 'en';
}
export async function initI18n(): Promise<void> {
  const stored = await chrome.storage.local.get(storageKey);
  const value = stored[storageKey];
  locale = value === 'bs' || value === 'en' ? value : detectLocale();
  document.documentElement.lang = locale;
}
export function getLocale(): Locale { return locale; }
export async function setLocale(value: 'auto'|'bs'|'en'): Promise<void> {
  locale = value === 'auto' ? detectLocale() : value;
  await chrome.storage.local.set({[storageKey]: value});
  document.documentElement.lang = locale;
}
export function t(key: keyof typeof messages.bs, vars?: Record<string,string>): string {
  let value = messages[locale][key] as string;
  for (const [k,v] of Object.entries(vars ?? {})) value = value.replaceAll(`{${k}}`, v);
  return value;
}
export function notificationCopy(type: string, ticketNumber?: string): {title:string; message:string; actionRequired:boolean} {
  const actionRequired = type === 'remote.requested' || /action|reply|required|response/i.test(type);
  const title = type === 'remote.requested' ? t('notificationRemote') : actionRequired ? t('notificationAction') : /reply|message/i.test(type) ? t('notificationReply') : t('notificationGeneric');
  const message = ticketNumber ? t('notificationMessage',{ticket:ticketNumber}) : t('notificationGeneric');
  return {title,message,actionRequired};
}
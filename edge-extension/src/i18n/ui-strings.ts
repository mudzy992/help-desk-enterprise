/**
 * i18n sloj (BS podrazumijevano, EN pripremljeno).
 * Detekcija: `chrome.i18n.getUILanguage()` (radi i u SW-u), fallback BS.
 */
export type UiLanguage = 'bs' | 'en';

// Runtime override — postavljeno u popup na klik, čuva se u local storage.
let _runtimeLanguage: UiLanguage | null = null;

export function setRuntimeLanguage(lang: UiLanguage): void {
  _runtimeLanguage = lang;
}

export function detectUiLanguage(): UiLanguage {
  if (_runtimeLanguage !== null) {
    return _runtimeLanguage;
  }
  try {
    const raw =
      typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage !== undefined
        ? chrome.i18n.getUILanguage()
        : 'bs-BA';
    return raw.toLowerCase().startsWith('bs') || raw.toLowerCase().startsWith('hr') ? 'bs' : 'en';
  } catch {
    return 'bs';
  }
}

export type UiStringKey =
  | 'appTagline'
  | 'welcomeTitle'
  | 'welcomeSubtitle'
  | 'emailLabel'
  | 'emailPlaceholder'
  | 'passwordLabel'
  | 'passwordPlaceholder'
  | 'signInAction'
  | 'signingInAction'
  | 'advancedSettings'
  | 'apiUrlLabel'
  | 'loginFailedFallback'
  | 'inboxTitle'
  | 'searchPlaceholder'
  | 'refreshAction'
  | 'emptyInboxTitle'
  | 'emptyInboxSubtitle'
  | 'openInDesk'
  | 'signOutAction'
  | 'sessionExpired'
  | 'backAction'
  | 'threadFallbackTitle'
  | 'composerPlaceholder'
  | 'sendAction'
  | 'chatDisabledNote'
  | 'threadLoadError'
  | 'unableToLoadInbox'
  | 'remoteBannerTitle'
  | 'remoteCardTitle'
  | 'remoteCardBody'
  | 'remoteOpenAction'
  | 'remoteOpenedNote'
  | 'connectionLive'
  | 'connectionPolling'
  | 'connectionOffline'
  | 'connectionDisabled'
  | 'connectionSignedOut'
  | 'denied.ADDON_OFF'
  | 'denied.DISABLED'
  | 'denied.NOTIFICATIONS_EDGE_OFF'
  | 'denied.KILL_SWITCH'
  | 'denied.DOMAIN'
  | 'denied.VERSION'
  | 'denied.UNAUTHENTICATED'
  | 'blockedHint'
  | 'deskUrlMissing'
  | 'toastOpenInDesk'
  | 'toastGenericTitle'
  | 'toastRemoteTitle'
  | 'toastRemoteBody'
  | 'toastSlaTitle'
  | 'toastMessageTitle'
  | 'toastTicketEventTitle'
  | 'priority.LOW'
  | 'priority.MEDIUM'
  | 'priority.HIGH'
  | 'priority.CRITICAL'
  | 'status.PENDING'
  | 'status.UNROUTED'
  | 'status.PENDING_APPROVAL'
  | 'status.ASSIGNED'
  | 'status.IN_PROGRESS'
  | 'status.WAITING_FOR_USER'
  | 'status.RESOLVED'
  | 'status.CLOSED'
  | 'status.ARCHIVED'
  | 'status.UNKNOWN'
  | 'time.justNow'
  | 'time.minutesAgo'
  | 'time.hoursAgo'
  | 'time.daysAgo'
  | 'unreadPillTitle'
  | 'requesterFallbackName'
  | 'youLabel'
  | 'versionLabel'
  | 'newMessageMeta'
  | 'languageToggleLabel'
  | 'userGreeting'
  | 'qaCodeDetected'
  | 'qaCodeHint'
  | 'qaCodeCopied'
  | 'qaOpenWithCode'
  | 'qaCopyCode'
  | 'qaCodeExpiry'
  | 'qaHowToTitle'
  | 'qaStep1'
  | 'qaStep2'
  | 'qaStep3';

type Dictionary = Record<UiStringKey, string>;

const bs: Dictionary = {
  appTagline: 'Tiketi & notifikacije, bez otvaranja Deska',
  welcomeTitle: 'Dobrodošli u EP-HelpDesk',
  welcomeSubtitle: 'Prijavite se da biste primali obavještenja i odgovarali na tikete direktno iz Edgea.',
  emailLabel: 'Email',
  emailPlaceholder: 'ime.prezime@epbih.ba',
  passwordLabel: 'Lozinka',
  passwordPlaceholder: '••••••••',
  signInAction: 'Prijava',
  signingInAction: 'Prijava u toku…',
  advancedSettings: 'Napredno: API adresa',
  apiUrlLabel: 'API URL',
  loginFailedFallback: 'Prijava nije uspjela. Provjerite podatke i pokušajte ponovo.',
  inboxTitle: 'Moji otvoreni tiketi',
  searchPlaceholder: 'Pretraga po broju ili naslovu…',
  refreshAction: 'Osvježi',
  emptyInboxTitle: 'Nema otvorenih tiketa',
  emptyInboxSubtitle: 'Kad podnesete zahtjev, pojavit će se ovdje zajedno s live porukama.',
  openInDesk: 'Otvori u Desku',
  signOutAction: 'Odjava',
  sessionExpired: 'Sesija je istekla. Prijavite se ponovo.',
  backAction: 'Nazad na tikete',
  threadFallbackTitle: 'Tiket',
  composerPlaceholder: 'Napišite odgovor… (Enter šalje, Shift+Enter novi red)',
  sendAction: 'Pošalji',
  chatDisabledNote: 'Brzi odgovori su onemogućeni u postavkama HelpDeska.',
  threadLoadError: 'Poruke se trenutno ne mogu učitati.',
  unableToLoadInbox: 'Tiketi se trenutno ne mogu učitati.',
  remoteBannerTitle: 'Zahtjev za udaljenu podršku čeka vašu potvrdu',
  remoteCardTitle: 'Vaša podrška traži udaljeni pristup',
  remoteCardBody: 'Agent je zatražio pristup vašem računaru putem Windows Quick Assist alata. Pokrenite ga samo ako očekujete ovaj zahtjev.',
  remoteOpenAction: 'Otvori Quick Assist',
  remoteOpenedNote: 'Quick Assist je pokrenut — prihvatite vezu u aplikaciji.',
  connectionLive: 'Uživo',
  connectionPolling: 'Polling',
  connectionOffline: 'Offline',
  connectionDisabled: 'Modul ugašen',
  connectionSignedOut: 'Niste prijavljeni',
  'denied.ADDON_OFF': 'Edge dodatak je isključen u postavkama sistema (addons.edge).',
  'denied.DISABLED': 'Edge ekstenzija je onemogućena od strane administratora.',
  'denied.NOTIFICATIONS_EDGE_OFF': 'Edge kanal notifikacija je ugašen u postavkama.',
  'denied.KILL_SWITCH': 'Modul je privremeno ugašen (kill switch). Kontaktirajte administratora.',
  'denied.DOMAIN': 'Vaša email adresa nije dozvoljena za korištenje ovog modula.',
  'denied.VERSION': 'Verzija ekstenzije je zastarjela. Ažurirajte ekstenziju.',
  'denied.UNAUTHENTICATED': 'Prijava je obavezna.',
  blockedHint: 'Ako smatrate da je ovo greška, kontaktirajte administratora HelpDeska.',
  deskUrlMissing: 'Adresa Deska nije podešena na serveru (APP_PUBLIC_URL).',
  toastOpenInDesk: 'Otvori u Desku',
  toastGenericTitle: 'EP-HelpDesk notifikacija',
  toastRemoteTitle: 'Zahtjev za udaljenu podršku',
  toastRemoteBody: 'Otvorite popup za pokretanje Quick Assist-a.',
  toastSlaTitle: 'SLA upozorenje',
  toastMessageTitle: 'Nova poruka na tiketu',
  toastTicketEventTitle: 'Ažuriranje tiketa',
  'priority.LOW': 'Nizak',
  'priority.MEDIUM': 'Srednji',
  'priority.HIGH': 'Visok',
  'priority.CRITICAL': 'Kritičan',
  'status.PENDING': 'Na čekanju',
  'status.UNROUTED': 'Neraspoređen',
  'status.PENDING_APPROVAL': 'Čeka odobrenje',
  'status.ASSIGNED': 'Dodijeljen',
  'status.IN_PROGRESS': 'U obradi',
  'status.WAITING_FOR_USER': 'Čeka korisnika',
  'status.RESOLVED': 'Riješen',
  'status.CLOSED': 'Zatvoren',
  'status.ARCHIVED': 'Arhiviran',
  'status.UNKNOWN': 'Nepoznato',
  'time.justNow': 'upravo',
  'time.minutesAgo': 'prije {n} min',
  'time.hoursAgo': 'prije {n} h',
  'time.daysAgo': 'prije {n} d',
  unreadPillTitle: 'Nepročitanih: {n}',
  requesterFallbackName: 'Podrška',
  youLabel: 'Vi',
  versionLabel: 'verzija',
  newMessageMeta: 'Novo',
  languageToggleLabel: 'EN',
  userGreeting: 'Prijavljeni ste kao',
  qaCodeDetected: 'Pronađen Quick Assist kôd',
  qaCodeHint: 'Agent vam je poslao kôd za udaljenu sesiju. Otvorite Quick Assist i unesite kôd.',
  qaCodeCopied: 'Kôd kopiran!',
  qaOpenWithCode: 'Otvori Quick Assist',
  qaCopyCode: 'Kopiraj kôd',
  qaCodeExpiry: 'Kôd važi ~10 minuta',
  qaHowToTitle: 'Kako se spojiti:',
  qaStep1: '1. Kliknite "Otvori Quick Assist" ispod',
  qaStep2: '2. Odaberite "Dobivanje pomoći"',
  qaStep3: '3. Unesite kôd: {code}',
};

const en: Dictionary = {
  appTagline: 'Tickets & notifications, without opening the Desk',
  welcomeTitle: 'Welcome to EP-HelpDesk',
  welcomeSubtitle: 'Sign in to receive notifications and reply to tickets directly from Edge.',
  emailLabel: 'Email',
  emailPlaceholder: 'first.last@epbih.ba',
  passwordLabel: 'Password',
  passwordPlaceholder: '••••••••',
  signInAction: 'Sign in',
  signingInAction: 'Signing in…',
  advancedSettings: 'Advanced: API address',
  apiUrlLabel: 'API URL',
  loginFailedFallback: 'Sign-in failed. Check your credentials and try again.',
  inboxTitle: 'My open tickets',
  searchPlaceholder: 'Search by number or title…',
  refreshAction: 'Refresh',
  emptyInboxTitle: 'No open tickets',
  emptyInboxSubtitle: 'Tickets you raise will appear here, with live messages.',
  openInDesk: 'Open in Desk',
  signOutAction: 'Sign out',
  sessionExpired: 'Your session expired. Please sign in again.',
  backAction: 'Back to tickets',
  threadFallbackTitle: 'Ticket',
  composerPlaceholder: 'Write a reply… (Enter to send, Shift+Enter for a new line)',
  sendAction: 'Send',
  chatDisabledNote: 'Quick replies are disabled in HelpDesk settings.',
  threadLoadError: 'Messages cannot be loaded right now.',
  unableToLoadInbox: 'Tickets cannot be loaded right now.',
  remoteBannerTitle: 'A remote support request is waiting for your confirmation',
  remoteCardTitle: 'Support is requesting remote access',
  remoteCardBody: 'An agent requested access to your machine via Windows Quick Assist. Only proceed if you expected this request.',
  remoteOpenAction: 'Open Quick Assist',
  remoteOpenedNote: 'Quick Assist launched — accept the connection in the app.',
  connectionLive: 'Live',
  connectionPolling: 'Polling',
  connectionOffline: 'Offline',
  connectionDisabled: 'Module off',
  connectionSignedOut: 'Signed out',
  'denied.ADDON_OFF': 'The Edge add-on is disabled in system settings (addons.edge).',
  'denied.DISABLED': 'The Edge extension is disabled by your administrator.',
  'denied.NOTIFICATIONS_EDGE_OFF': 'The Edge notification channel is turned off.',
  'denied.KILL_SWITCH': 'The module is temporarily disabled (kill switch). Contact your administrator.',
  'denied.DOMAIN': 'Your email address is not allowed to use this module.',
  'denied.VERSION': 'The extension version is outdated. Please update the extension.',
  'denied.UNAUTHENTICATED': 'Sign-in required.',
  blockedHint: 'If you believe this is an error, contact your HelpDesk administrator.',
  deskUrlMissing: 'The Desk address is not configured on the server (APP_PUBLIC_URL).',
  toastOpenInDesk: 'Open in Desk',
  toastGenericTitle: 'EP-HelpDesk notification',
  toastRemoteTitle: 'Remote support request',
  toastRemoteBody: 'Open the popup to launch Quick Assist.',
  toastSlaTitle: 'SLA warning',
  toastMessageTitle: 'New ticket message',
  toastTicketEventTitle: 'Ticket update',
  'priority.LOW': 'Low',
  'priority.MEDIUM': 'Medium',
  'priority.HIGH': 'High',
  'priority.CRITICAL': 'Critical',
  'status.PENDING': 'Pending',
  'status.UNROUTED': 'Unrouted',
  'status.PENDING_APPROVAL': 'Awaiting approval',
  'status.ASSIGNED': 'Assigned',
  'status.IN_PROGRESS': 'In progress',
  'status.WAITING_FOR_USER': 'Waiting for user',
  'status.RESOLVED': 'Resolved',
  'status.CLOSED': 'Closed',
  'status.ARCHIVED': 'Archived',
  'status.UNKNOWN': 'Unknown',
  'time.justNow': 'just now',
  'time.minutesAgo': '{n} min ago',
  'time.hoursAgo': '{n} h ago',
  'time.daysAgo': '{n} d ago',
  unreadPillTitle: 'Unread: {n}',
  requesterFallbackName: 'Support',
  youLabel: 'You',
  versionLabel: 'version',
  newMessageMeta: 'New',
  languageToggleLabel: 'BS',
  userGreeting: 'Signed in as',
  qaCodeDetected: 'Quick Assist code found',
  qaCodeHint: 'Your support agent sent a session code. Open Quick Assist and enter the code.',
  qaCodeCopied: 'Code copied!',
  qaOpenWithCode: 'Open Quick Assist',
  qaCopyCode: 'Copy code',
  qaCodeExpiry: 'Code valid ~10 minutes',
  qaHowToTitle: 'How to connect:',
  qaStep1: '1. Click "Open Quick Assist" below',
  qaStep2: '2. Select "Get assistance"',
  qaStep3: '3. Enter code: {code}',
};

const dictionaries: Record<UiLanguage, Dictionary> = { bs, en };

export function t(
  key: UiStringKey,
  replacements?: Record<string, string | number>,
  language: UiLanguage = detectUiLanguage(),
): string {
  let value = dictionaries[language][key];
  if (replacements !== undefined) {
    for (const [name, replacement] of Object.entries(replacements)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return value;
}

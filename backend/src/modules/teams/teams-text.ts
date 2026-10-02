/**
 * Paket 3.1: texts the bot writes into Teams (bs/en). Cards are rendered by
 * Teams, not by our frontend, so these strings live in the backend; the
 * product name always comes from branding (nothing is hard-coded).
 */
export type TeamsLocale = 'bs' | 'en';

const texts = {
  bs: {
    welcomeTitle: 'Dobro došli u {app}',
    welcomeLinked: 'Vaš Teams nalog je povezan s nalogom {name}. Ovdje ćete dobijati obavijesti i moći odgovarati na tikete.',
    notLinked: 'Vaš Teams nalog nije povezan s nalogom u aplikaciji – obratite se administratoru.',
    helpTitle: 'Šta mogu uraditi',
    helpNewTicket: '**novi tiket** – prijava novog tiketa',
    helpMyTickets: '**moji tiketi** – zadnjih 5 otvorenih tiketa',
    helpHelp: '**pomoć** – ova poruka',
    helpChannel: 'U kanalu: **@bot poveži** povezuje kanal s grupom, **@bot odspoji** uklanja vezu.',
    myTicketsTitle: 'Moji otvoreni tiketi',
    myTicketsEmpty: 'Nemate otvorenih tiketa.',
    open: 'Otvori',
    openApp: 'Otvori aplikaciju',
    newTicketSoon: 'Kreiranje tiketa iz Teamsa trenutno nije dostupno. Tiket možete prijaviti u aplikaciji.',
    newTicketDisabled: 'Kreiranje tiketa iz Teamsa je isključeno. Tiket možete prijaviti u aplikaciji.',
    linkTitle: 'Poveži kanal s grupom',
    linkChoose: 'Izaberite grupu čiji će se događaji objavljivati u ovom kanalu.',
    linkGroup: 'Grupa',
    linkSubmit: 'Poveži',
    linkNone: 'Nemate grupa koje možete povezati s kanalom.',
    linkForbidden: 'Nemate pravo povezivanja kanala.',
    linkOnlyChannel: 'Povezivanje radi samo u kanalu tima.',
    linkDone: 'Kanal je povezan s grupom **{group}**.',
    unlinkDone: 'Uklonjeno veza: {count}.',
    unlinkNone: 'Ovaj kanal nije povezan ni s jednom grupom kojom upravljate.',
    channelsDisabled: 'Obavijesti u kanale su isključene u postavkama.',
    actionUnavailable: 'Ova akcija još nije dostupna.',
    actionFailed: 'Akcija nije uspjela. Pokušajte ponovo ili otvorite aplikaciju.',
  },
  en: {
    welcomeTitle: 'Welcome to {app}',
    welcomeLinked: 'Your Teams account is linked to {name}. You will get notifications here and can reply to tickets.',
    notLinked: 'Your Teams account is not linked to an account in the application – please contact your administrator.',
    helpTitle: 'What I can do',
    helpNewTicket: '**new ticket** – report a new ticket',
    helpMyTickets: '**my tickets** – your last 5 open tickets',
    helpHelp: '**help** – this message',
    helpChannel: 'In a channel: **@bot link** links the channel to a group, **@bot unlink** removes the link.',
    myTicketsTitle: 'My open tickets',
    myTicketsEmpty: 'You have no open tickets.',
    open: 'Open',
    openApp: 'Open application',
    newTicketSoon: 'Creating tickets from Teams is not available yet. You can report a ticket in the application.',
    newTicketDisabled: 'Creating tickets from Teams is turned off. You can report a ticket in the application.',
    linkTitle: 'Link channel to a group',
    linkChoose: 'Choose the group whose events will be posted to this channel.',
    linkGroup: 'Group',
    linkSubmit: 'Link',
    linkNone: 'You have no groups you can link to a channel.',
    linkForbidden: 'You are not allowed to link channels.',
    linkOnlyChannel: 'Linking works only in a team channel.',
    linkDone: 'The channel is linked to the group **{group}**.',
    unlinkDone: 'Links removed: {count}.',
    unlinkNone: 'This channel is not linked to any group you manage.',
    channelsDisabled: 'Channel notifications are turned off in the settings.',
    actionUnavailable: 'This action is not available yet.',
    actionFailed: 'The action failed. Try again or open the application.',
  },
} as const;

export type TeamsTextKey = keyof (typeof texts)['bs'];

export function teamsText(locale: TeamsLocale, key: TeamsTextKey, params: Record<string, string | number> = {}): string {
  return texts[locale][key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function toTeamsLocale(value: string | null | undefined): TeamsLocale {
  return value?.toLowerCase().startsWith('en') ? 'en' : 'bs';
}

const statusLabels: Record<TeamsLocale, Record<string, string>> = {
  bs: { PENDING: 'Na čekanju', UNROUTED: 'Nerutiran', PENDING_APPROVAL: 'Čeka odobrenje', ASSIGNED: 'Dodijeljen', IN_PROGRESS: 'U radu', WAITING_FOR_USER: 'Čeka korisnika', RESOLVED: 'Riješen', CLOSED: 'Zatvoren', ARCHIVED: 'Arhiviran' },
  en: { PENDING: 'Pending', UNROUTED: 'Unrouted', PENDING_APPROVAL: 'Pending approval', ASSIGNED: 'Assigned', IN_PROGRESS: 'In progress', WAITING_FOR_USER: 'Waiting for user', RESOLVED: 'Resolved', CLOSED: 'Closed', ARCHIVED: 'Archived' },
};

export function teamsStatusLabel(locale: TeamsLocale, status: string): string {
  return statusLabels[locale][status] ?? status;
}

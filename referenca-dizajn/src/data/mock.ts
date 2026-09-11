import type {
  Availability,
  Level,
  Lifecycle,
  OU,
  Priority,
  RoutingRule,
  SlaState,
  TicketStatus,
} from "../lib/core";

/* ------------------------------------------------------------------ */
/* Organizaciona struktura (OU tree — DN + ouPath)                     */
/* ------------------------------------------------------------------ */

export const OUS: OU[] = [
  { id: "ou-root", name: "Korisnici", distinguishedName: "OU=Korisnici,DC=ep,DC=local", ouPath: "/Korisnici", parentId: null, userCount: 412 },
  { id: "ou-dir", name: "Direkcija", distinguishedName: "OU=Direkcija,OU=Korisnici,DC=ep,DC=local", ouPath: "/Korisnici/Direkcija", parentId: "ou-root", userCount: 6 },
  { id: "ou-it", name: "IT odjel", distinguishedName: "OU=IT,OU=Korisnici,DC=ep,DC=local", ouPath: "/Korisnici/IT odjel", parentId: "ou-root", userCount: 38 },
  { id: "ou-it-infra", name: "Infrastruktura", distinguishedName: "OU=Infrastruktura,OU=IT,OU=Korisnici,DC=ep,DC=local", ouPath: "/Korisnici/IT odjel/Infrastruktura", parentId: "ou-it", userCount: 14 },
  { id: "ou-it-dev", name: "Razvoj", distinguishedName: "OU=Razvoj,OU=IT,OU=Korisnici,DC=ep,DC=local", ouPath: "/Korisnici/IT odjel/Razvoj", parentId: "ou-it", userCount: 24 },
  { id: "ou-fin", name: "Finansije i računovodstvo", distinguishedName: "OU=Finansije,OU=Korisnici,DC=ep,DC=local", ouPath: "/Korisnici/Finansije i računovodstvo", parentId: "ou-root", userCount: 27 },
  { id: "ou-hr", name: "Ljudski resursi", distinguishedName: "OU=HR,OU=Korisnici,DC=ep,DC=local", ouPath: "/Korisnici/Ljudski resursi", parentId: "ou-root", userCount: 11 },
  { id: "ou-pravni", name: "Pravni poslovi", distinguishedName: "OU=Pravni,OU=Korisnici,DC=ep,DC=local", ouPath: "/Korisnici/Pravni poslovi", parentId: "ou-root", userCount: 8 },
  { id: "ou-op", name: "Operateri", distinguishedName: "OU=Operateri,OU=Korisnici,DC=ep,DC=local", ouPath: "/Korisnici/Operateri", parentId: "ou-root", userCount: 264 },
  { id: "ou-op-sa", name: "Sarajevo", distinguishedName: "OU=Sarajevo,OU=Operateri,OU=Korisnici,DC=ep,DC=local", ouPath: "/Korisnici/Operateri/Sarajevo", parentId: "ou-op", userCount: 128 },
  { id: "ou-op-tz", name: "Tuzla", distinguishedName: "OU=Tuzla,OU=Operateri,OU=Korisnici,DC=ep,DC=local", ouPath: "/Korisnici/Operateri/Tuzla", parentId: "ou-op", userCount: 84 },
  { id: "ou-op-mo", name: "Mostar", distinguishedName: "OU=Mostar,OU=Operateri,OU=Korisnici,DC=ep,DC=local", ouPath: "/Korisnici/Operateri/Mostar", parentId: "ou-op", userCount: 52 },
  { id: "ou-prodaja", name: "Prodaja", distinguishedName: "OU=Prodaja,OU=Korisnici,DC=ep,DC=local", ouPath: "/Korisnici/Prodaja", parentId: "ou-root", userCount: 58 },
];

export const ouById = (id: string) => OUS.find((o) => o.id === id)!;
export const ouShort = (id: string) => ouById(id).ouPath.replace("/Korisnici/", "").replace("/Korisnici", "Root");

/* ------------------------------------------------------------------ */
/* Korisnici i grupe                                                   */
/* ------------------------------------------------------------------ */

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  roleTone: "super" | "agent" | "manager" | "user";
  ouId: string;
  groupId?: string;
  policyPack?: "IT" | "HR" | "FIN";
  openLoad: number;
  mfa: boolean;
  active: boolean;
}

export const USERS: User[] = [
  { id: "u-emir", name: "Emir Kovač", email: "emir.kovac@ep.ba", role: "SuperAdmin", roleTone: "super", ouId: "ou-it", openLoad: 4, mfa: true, active: true },
  { id: "u-amar", name: "Amar Softić", email: "amar.softic@ep.ba", role: "Agent L1", roleTone: "agent", ouId: "ou-it", groupId: "g-l1", policyPack: "IT", openLoad: 11, mfa: true, active: true },
  { id: "u-lejla", name: "Lejla Hadžić", email: "lejla.hadzic@ep.ba", role: "Agent L2", roleTone: "agent", ouId: "ou-it-infra", groupId: "g-l2", policyPack: "IT", openLoad: 7, mfa: true, active: true },
  { id: "u-adnan", name: "Adnan Begić", email: "adnan.begic@ep.ba", role: "Sistem inženjer", roleTone: "agent", ouId: "ou-it-infra", groupId: "g-sys", policyPack: "IT", openLoad: 3, mfa: true, active: true },
  { id: "u-alma", name: "Alma Dizdarević", email: "alma.dizdarevic@ep.ba", role: "Sigurnosni analitičar", roleTone: "agent", ouId: "ou-it", groupId: "g-soc", policyPack: "IT", openLoad: 2, mfa: true, active: true },
  { id: "u-selma", name: "Selma Jahić", email: "selma.jahic@ep.ba", role: "HR servisni agent", roleTone: "agent", ouId: "ou-hr", groupId: "g-hr", policyPack: "HR", openLoad: 5, mfa: true, active: true },
  { id: "u-faris", name: "Faris Mujić", email: "faris.mujic@ep.ba", role: "Finansijski agent", roleTone: "agent", ouId: "ou-fin", groupId: "g-fin", policyPack: "FIN", openLoad: 6, mfa: false, active: true },
  { id: "u-dzenana", name: "Dženana Softić", email: "dzenana.softic@ep.ba", role: "Menadžer usluga", roleTone: "manager", ouId: "ou-it", openLoad: 1, mfa: true, active: true },
  { id: "u-aida", name: "Aida Čengić", email: "aida.cengic@ep.ba", role: "Korisnik", roleTone: "user", ouId: "ou-op-tz", openLoad: 0, mfa: true, active: true },
  { id: "u-mirza", name: "Mirza Delić", email: "mirza.delic@ep.ba", role: "Korisnik", roleTone: "user", ouId: "ou-fin", openLoad: 0, mfa: false, active: true },
  { id: "u-nedim", name: "Nedim Krupalija", email: "nedim.krupalija@ep.ba", role: "Korisnik", roleTone: "user", ouId: "ou-op-sa", openLoad: 0, mfa: true, active: true },
  { id: "u-lamija", name: "Lamija Omerović", email: "lamija.omerovic@ep.ba", role: "Korisnik", roleTone: "user", ouId: "ou-hr", openLoad: 0, mfa: true, active: true },
  { id: "u-haris", name: "Haris Dautović", email: "haris.dautovic@ep.ba", role: "Korisnik", roleTone: "user", ouId: "ou-prodaja", openLoad: 0, mfa: false, active: false },
  { id: "u-sanja", name: "Sanja Krišto", email: "sanja.kristo@ep.ba", role: "Korisnik", roleTone: "user", ouId: "ou-op-mo", openLoad: 0, mfa: true, active: true },
];

export const userById = (id: string) => USERS.find((u) => u.id === id)!;
export const CURRENT_USER = userById("u-emir");

export interface Group {
  id: string;
  name: string;
  members: number;
  autoAssign: "LEAST_BUSY" | "ROUND_ROBIN" | null;
  inboxCount: number;
  scope: string;
}

export const GROUPS: Group[] = [
  { id: "g-l1", name: "IT Podrška L1", members: 6, autoAssign: "ROUND_ROBIN", inboxCount: 5, scope: "IT odjel" },
  { id: "g-l2", name: "IT Podrška L2", members: 4, autoAssign: "LEAST_BUSY", inboxCount: 3, scope: "Infrastruktura" },
  { id: "g-soc", name: "Sigurnost (SOC)", members: 3, autoAssign: "LEAST_BUSY", inboxCount: 1, scope: "Cijela organizacija" },
  { id: "g-hr", name: "HR Servisi", members: 3, autoAssign: "ROUND_ROBIN", inboxCount: 2, scope: "Ljudski resursi" },
  { id: "g-fin", name: "Finansijski Servisi", members: 4, autoAssign: null, inboxCount: 4, scope: "Finansije" },
  { id: "g-sys", name: "Sistem Inženjeri", members: 2, autoAssign: "LEAST_BUSY", inboxCount: 1, scope: "Infrastruktura" },
];

export const groupById = (id: string | null) =>
  id ? GROUPS.find((g) => g.id === id) ?? null : null;

/* ------------------------------------------------------------------ */
/* Katalog usluga                                                      */
/* ------------------------------------------------------------------ */

export interface ServiceCategory {
  id: string;
  name: string;
  description: string;
}

export const CATEGORIES: ServiceCategory[] = [
  { id: "cat-it", name: "IT podrška", description: "Hardver, softver i svakodnevna podrška" },
  { id: "cat-access", name: "Pristup i nalozi", description: "Nalozi, dozvole i pristup sistemima" },
  { id: "cat-hr", name: "HR servisi", description: "Zapošljavanje, odsustva i podaci o zaposlenim" },
  { id: "cat-fin", name: "Finansije", description: "Refundacije, nabavka i budžet" },
  { id: "cat-infra", name: "Infrastruktura", description: "Mreža, serveri i prostorije" },
];

export interface FormField {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "date";
  required?: boolean;
  options?: string[];
  hint?: string;
}

export interface Service {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  description: string;
  lifecycle: Lifecycle;
  availability: Availability;
  downtime?: string;
  formVersion: string;
  slaProfileId: string;
  approvals: number;
  openTickets: number;
  fields: FormField[];
}

export const SERVICES: Service[] = [
  {
    id: "sv-vpn", slug: "vpn-mreza", name: "VPN i mrežni pristup", categoryId: "cat-infra",
    description: "Prijave kvarova i problema s VPN konekcijom i mrežnim pristupom.",
    lifecycle: "ACTIVE", availability: "DEGRADED", formVersion: "v4", slaProfileId: "sla-inc",
    approvals: 0, openTickets: 6,
    fields: [
      { key: "lokacija", label: "Lokacija rada", type: "select", required: true, options: ["Kancelarija", "Rad od kuće", "Teren"] },
      { key: "uredjaj", label: "Uređaj", type: "select", required: true, options: ["Laptop (Windows 11)", "Desktop", "MacBook"] },
      { key: "opis", label: "Opis problema", type: "textarea", required: true, hint: "Kada je problem počeo i da li se ponavlja?" },
    ],
  },
  {
    id: "sv-incident", slug: "incident-radna-stanica", name: "Incident — radna stanica", categoryId: "cat-it",
    description: "Kvar ili neispravnost računara, periferije ili instaliranog softvera.",
    lifecycle: "ACTIVE", availability: "AVAILABLE", formVersion: "v7", slaProfileId: "sla-inc",
    approvals: 0, openTickets: 9,
    fields: [
      { key: "inventar", label: "Inventarski broj uređaja", type: "text", required: true, hint: "npr. WS-114 — naljepnica na kućištu" },
      { key: "opis", label: "Opis kvara", type: "textarea", required: true },
    ],
  },
  {
    id: "sv-lozinka", slug: "reset-lozinke", name: "Reset lozinke", categoryId: "cat-access",
    description: "Otključavanje naloga i reset lozinke za domenski ili aplikacijski pristup.",
    lifecycle: "ACTIVE", availability: "AVAILABLE", formVersion: "v2", slaProfileId: "sla-access",
    approvals: 0, openTickets: 3,
    fields: [{ key: "sistem", label: "Sistem", type: "select", required: true, options: ["Domena (Windows)", "SAP", "Email (O365)", "VPN portal"] }],
  },
  {
    id: "sv-sap", slug: "pristup-sap", name: "Pristup SAP modulima", categoryId: "cat-access",
    description: "Zahtjev za dodjelu ili izmjenu uloga unutar SAP sistema (uz odobrenja).",
    lifecycle: "ACTIVE", availability: "AVAILABLE", formVersion: "v5", slaProfileId: "sla-access",
    approvals: 2, openTickets: 4,
    fields: [
      { key: "modul", label: "SAP modul", type: "select", required: true, options: ["FI — Finansije", "MM — Nabavka", "HR — Kadrovi", "CO — Kontroling"] },
      { key: "uloga", label: "Tražena uloga", type: "select", required: true, options: ["Pregled (read-only)", "Unos", "Odobravanje"] },
      { key: "obrazlozenje", label: "Poslovno obrazloženje", type: "textarea", required: true },
    ],
  },
  {
    id: "sv-onboard", slug: "onboarding-zaposlenika", name: "Onboarding zaposlenika", categoryId: "cat-hr",
    description: "Priprema naloga, opreme i pristupa za novog zaposlenika prije prvog radnog dana.",
    lifecycle: "ACTIVE", availability: "AVAILABLE", formVersion: "v3", slaProfileId: "sla-hr",
    approvals: 1, openTickets: 2,
    fields: [
      { key: "ime", label: "Ime i prezime novog zaposlenika", type: "text", required: true },
      { key: "datum", label: "Prvi radni dan", type: "date", required: true },
      { key: "oprema", label: "Potrebna oprema", type: "select", options: ["Laptop + dock", "Desktop", "Bez opreme"] },
    ],
  },
  {
    id: "sv-odsustvo", slug: "korekcija-odsustva", name: "Korekcija odsustva", categoryId: "cat-hr",
    description: "Ispravke evidentiranog godišnjeg odmora, bolovanja i drugih odsustava.",
    lifecycle: "ACTIVE", availability: "AVAILABLE", formVersion: "v1", slaProfileId: "sla-hr",
    approvals: 1, openTickets: 1,
    fields: [
      { key: "period", label: "Period koji se koriguje", type: "text", required: true },
      { key: "razlog", label: "Razlog korekcije", type: "textarea", required: true },
    ],
  },
  {
    id: "sv-refund", slug: "refundacija-troskova", name: "Refundacija putnih troškova", categoryId: "cat-fin",
    description: "Zahtjevi za refundaciju dnevnica, kilometarine i ostalih putnih troškova.",
    lifecycle: "ACTIVE", availability: "AVAILABLE", formVersion: "v2", slaProfileId: "sla-fin",
    approvals: 1, openTickets: 3,
    fields: [
      { key: "iznos", label: "Ukupan iznos (KM)", type: "text", required: true },
      { key: "relacija", label: "Relacija putovanja", type: "text", required: true },
    ],
  },
  {
    id: "sv-nabavka", slug: "nabavka-opreme", name: "Nabavka IT opreme", categoryId: "cat-fin",
    description: "Zahtjevi za nabavku računarske opreme iznad internog praga odobrenja.",
    lifecycle: "ACTIVE", availability: "AVAILABLE", formVersion: "v6", slaProfileId: "sla-fin",
    approvals: 2, openTickets: 5,
    fields: [
      { key: "artikal", label: "Šta se nabavlja", type: "text", required: true },
      { key: "budzet", label: "Budžetska linija", type: "select", required: true, options: ["CAPEX 2026", "OPEX — IT", "OPEX — Projekti"] },
      { key: "obrazlozenje", label: "Obrazloženje potrebe", type: "textarea", required: true },
    ],
  },
  {
    id: "sv-phish", slug: "prijava-phishing", name: "Prijava sumnjivog email-a", categoryId: "cat-it",
    description: "Prijava phishing pokušaja i sumnjivih poruka sigurnosnom timu (SOC).",
    lifecycle: "ACTIVE", availability: "AVAILABLE", formVersion: "v2", slaProfileId: "sla-inc",
    approvals: 0, openTickets: 4,
    fields: [{ key: "posiljalac", label: "Pošiljalac poruke", type: "text", required: true }],
  },
  {
    id: "sv-autocad", slug: "instalacija-autocad", name: "Instalacija AutoCAD licence", categoryId: "cat-it",
    description: "Dodjela i instalacija AutoCAD licence za projektne timove.",
    lifecycle: "DEPRECATED", availability: "MAINTENANCE", downtime: "planirana migracija licencnog servera 15. 02.",
    formVersion: "v1", slaProfileId: "sla-std", approvals: 1, openTickets: 0,
    fields: [{ key: "uredjaj", label: "Ciljni uređaj", type: "text", required: true }],
  },
  {
    id: "sv-projektor", slug: "oprema-sala-sastanaka", name: "Oprema sala za sastanke", categoryId: "cat-infra",
    description: "Kvarovi AV opreme, projektora i sistema za video sastanke u salama.",
    lifecycle: "ACTIVE", availability: "AVAILABLE", formVersion: "v2", slaProfileId: "sla-std",
    approvals: 0, openTickets: 1,
    fields: [
      { key: "sala", label: "Sala", type: "select", required: true, options: ["B1 — Prijemna", "B2 — Velika", "C1 — Sprint", "D3 — Užina"] },
      { key: "opis", label: "Opis kvara", type: "textarea", required: true },
    ],
  },
  {
    id: "sv-disk", slug: "zajednicki-disk", name: "Pristup zajedničkom disku", categoryId: "cat-access",
    description: "Mapiranje i dozvole nad timskim share-ovima (uz odobrenje vlasnika podataka).",
    lifecycle: "ACTIVE", availability: "AVAILABLE", formVersion: "v3", slaProfileId: "sla-access",
    approvals: 1, openTickets: 2,
    fields: [
      { key: "share", label: "Putanja share-a", type: "text", required: true, hint: "npr. \\\\fs01\\pravni-tim" },
      { key: "nivo", label: "Nivo pristupa", type: "select", required: true, options: ["Čitanje", "Čitanje i pisanje"] },
    ],
  },
];

export const serviceById = (id: string) => SERVICES.find((s) => s.id === id)!;
export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id)!;

/* ------------------------------------------------------------------ */
/* Routing pravila (originUnit + service → group)                      */
/* ------------------------------------------------------------------ */

export const ROUTING_RULES: RoutingRule[] = [
  { id: "rr-01", originUnitId: "ou-root", serviceId: "sv-lozinka", groupId: "g-l1", updatedAt: "2026-01-18T09:12:00", updatedBy: "Emir Kovač" },
  { id: "rr-02", originUnitId: "ou-root", serviceId: "sv-incident", groupId: "g-l1", updatedAt: "2026-01-18T09:12:00", updatedBy: "Emir Kovač" },
  { id: "rr-03", originUnitId: "ou-root", serviceId: "sv-phish", groupId: "g-soc", updatedAt: "2026-01-20T14:40:00", updatedBy: "Alma Dizdarević" },
  { id: "rr-04", originUnitId: "ou-root", serviceId: "sv-onboard", groupId: "g-hr", updatedAt: "2026-01-18T09:15:00", updatedBy: "Emir Kovač" },
  { id: "rr-05", originUnitId: "ou-root", serviceId: "sv-odsustvo", groupId: "g-hr", updatedAt: "2026-01-18T09:15:00", updatedBy: "Emir Kovač" },
  { id: "rr-06", originUnitId: "ou-root", serviceId: "sv-refund", groupId: "g-fin", updatedAt: "2026-01-22T11:03:00", updatedBy: "Emir Kovač" },
  { id: "rr-07", originUnitId: "ou-root", serviceId: "sv-nabavka", groupId: "g-fin", updatedAt: "2026-01-22T11:03:00", updatedBy: "Emir Kovač" },
  { id: "rr-08", originUnitId: "ou-root", serviceId: "sv-sap", groupId: "g-fin", updatedAt: "2026-01-22T11:04:00", updatedBy: "Emir Kovač" },
  { id: "rr-09", originUnitId: "ou-root", serviceId: "sv-disk", groupId: "g-l2", updatedAt: "2026-02-02T08:31:00", updatedBy: "Adnan Begić" },
  { id: "rr-10", originUnitId: "ou-root", serviceId: "sv-projektor", groupId: "g-sys", updatedAt: "2026-02-02T08:31:00", updatedBy: "Adnan Begić" },
  { id: "rr-11", originUnitId: "ou-op-tz", serviceId: "sv-vpn", groupId: "g-l2", updatedAt: "2026-02-09T16:22:00", updatedBy: "Lejla Hadžić" },
  { id: "rr-12", originUnitId: "ou-it", serviceId: "sv-vpn", groupId: "g-sys", updatedAt: "2026-02-09T16:25:00", updatedBy: "Lejla Hadžić" },
];

/* ------------------------------------------------------------------ */
/* Tiketi                                                              */
/* ------------------------------------------------------------------ */

export interface Approval {
  step: number;
  approverId: string;
  role: string;
  state: "APPROVED" | "PENDING" | "REJECTED";
  at?: string;
  note?: string;
}

export interface TicketMessage {
  id: string;
  at: string;
  authorId: string | "system";
  kind: "PUBLIC" | "INTERNAL" | "SYSTEM";
  body: string;
}

export interface TicketActivity {
  id: string;
  at: string;
  actor: string;
  text: string;
  kind: "status" | "assign" | "sla" | "routing" | "approval" | "edit" | "security";
}

export interface TimeLog {
  id: string;
  userId: string;
  minutes: number;
  note: string;
  at: string;
}

export interface Attachment {
  id: string;
  name: string;
  size: string;
  kind: "pdf" | "img" | "doc" | "log" | "xls";
  classification: "Interno" | "Povjerljivo";
  byId: string;
  at: string;
}

export interface Ticket {
  id: string;
  title: string;
  serviceId: string;
  originUnitId: string;
  requesterId: string;
  status: TicketStatus;
  impact: Level;
  urgency: Level;
  priority: Priority;
  groupId: string | null;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
  respondBy: string;
  resolveBy: string;
  slaPaused: boolean;
  slaState: SlaState;
  channel: "Portal" | "Email" | "Telefon";
  formVersion: string;
  confidential?: boolean;
  approvals?: Approval[];
  watchers: string[];
  csat?: number;
  closeCode?: string;
  timeSpentMin: number;
  messages: TicketMessage[];
  activities: TicketActivity[];
  timeLogs: TimeLog[];
  attachments: Attachment[];
}

const T = "2026-02-12";

export const TICKETS: Ticket[] = [
  {
    id: "EP-1043",
    title: "Ne radi VPN konekcija od jutros — cijeli tim Tuzla",
    serviceId: "sv-vpn", originUnitId: "ou-op-tz", requesterId: "u-aida",
    status: "IN_PROGRESS", impact: "HIGH", urgency: "HIGH", priority: "CRITICAL",
    groupId: "g-l2", assigneeId: "u-lejla",
    createdAt: `${T}T07:58:00`, updatedAt: `${T}T11:20:00`,
    respondBy: `${T}T08:28:00`, resolveBy: `${T}T19:58:00`,
    slaPaused: false, slaState: "RISK", channel: "Portal", formVersion: "v4",
    watchers: ["u-emir", "u-adnan"], timeSpentMin: 145,
    messages: [
      { id: "m1", at: `${T}T07:58:00`, authorId: "u-aida", kind: "PUBLIC", body: "Od jutros niko od nas u Tuzli ne može na VPN. Greška 809 nakon unosa kredencijala. Imamo izvještavanje do 12:00, hitno je." },
      { id: "m2", at: `${T}T08:06:00`, authorId: "system", kind: "SYSTEM", body: "Routing: PARENT_FALLBACK — pravilo RR-11 na OU /Korisnici/Operateri/Tuzla → grupa IT Podrška L2. Prioritet izračunat iz matrice: Kritičan (visok uticaj × visoka hitnost)." },
      { id: "m3", at: `${T}T08:14:00`, authorId: "u-lejla", kind: "PUBLIC", body: "Preuzela sam tiket. Vidimo povišen broj odbijenih IKE sesija na concentratoru nakon noćašnjeg update-a. Provjeravam sa Sistem inženjerima." },
      { id: "m4", at: `${T}T09:47:00`, authorId: "u-lejla", kind: "INTERNAL", body: "Rollback kernel modula na vpn-gw-02 riješio je problem za Mostar; Tuzla ide kroz isti gateway pa će vjerovatno pomoći. @Adnan možeš li potvrditi preseeding CRL liste?" },
      { id: "m5", at: `${T}T11:20:00`, authorId: "u-aida", kind: "PUBLIC", body: "Dio kolega se uspio spojiti, ali još uvijek ne svi. Da li da pokušamo sa restartom klijenta?" },
    ],
    activities: [
      { id: "a1", at: `${T}T07:58:00`, actor: "Aida Čengić", text: "kreirala tiket preko portala (forma VPN i mrežni pristup, v4)", kind: "edit" },
      { id: "a2", at: `${T}T08:06:00`, actor: "RoutingService", text: "dodijeljen grupi IT Podrška L2 (naslijeđeno s OU Tuzla, dubina 0)", kind: "routing" },
      { id: "a3", at: `${T}T08:11:00`, actor: "Lejla Hadžić", text: "preuzela tiket iz grupnog inboxa", kind: "assign" },
      { id: "a4", at: `${T}T08:11:00`, actor: "Sistem", text: "status: Na čekanju → U obradi; SLA response zadovoljen (16 min)", kind: "status" },
      { id: "a5", at: `${T}T10:02:00`, actor: "Sistem", text: "SLA upozorenje: 75% resolution vremena iskorišteno", kind: "sla" },
    ],
    timeLogs: [
      { id: "tl1", userId: "u-lejla", minutes: 85, note: "Dijagnostika IKE/CRL na vpn-gw-02", at: `${T}T10:30:00` },
      { id: "tl2", userId: "u-adnan", minutes: 60, note: "Rollback kernel modula, test s 3 klijenta", at: `${T}T11:05:00` },
    ],
    attachments: [
      { id: "at1", name: "vpn-error-809.png", size: "212 KB", kind: "img", classification: "Interno", byId: "u-aida", at: `${T}T07:59:00` },
      { id: "at2", name: "ike-sessions.log", size: "1,4 MB", kind: "log", classification: "Interno", byId: "u-lejla", at: `${T}T08:22:00` },
    ],
  },
  {
    id: "EP-1042",
    title: "Sumnjiv phishing email — lažna faktura dobavljača",
    serviceId: "sv-phish", originUnitId: "ou-fin", requesterId: "u-mirza",
    status: "ASSIGNED", impact: "HIGH", urgency: "HIGH", priority: "CRITICAL",
    groupId: "g-soc", assigneeId: "u-alma",
    createdAt: `${T}T09:12:00`, updatedAt: `${T}T10:45:00`,
    respondBy: `${T}T09:42:00`, resolveBy: `${T}T21:12:00`,
    slaPaused: false, slaState: "OK", channel: "Portal", formVersion: "v2",
    watchers: ["u-emir"], timeSpentMin: 35,
    messages: [
      { id: "m1", at: `${T}T09:12:00`, authorId: "u-mirza", kind: "PUBLIC", body: "Primili smo fakturu koja izgleda kao od redovnog dobavljača, ali domena je malko drugačija (.co umjesto .ba). Nismo ništa otvarali." },
      { id: "m2", at: `${T}T09:12:00`, authorId: "system", kind: "SYSTEM", body: "Routing: EXACT — pravilo RR-03 na OU /Korisnici → grupa Sigurnost (SOC)." },
      { id: "m3", at: `${T}T10:45:00`, authorId: "u-alma", kind: "PUBLIC", body: "Potvrđeno: credential phishing kampanja. Poruka je izolovana na nivou tenanta, domjena blokirana. Molim da niko ne prosljeđuje prilog. Nastavljamo forenziku headera." },
    ],
    activities: [
      { id: "a1", at: `${T}T09:12:00`, actor: "RoutingService", text: "dodijeljen grupi Sigurnost (SOC) — exact pravilo, dubina 0", kind: "routing" },
      { id: "a2", at: `${T}T09:26:00`, actor: "TicketAssignmentService", text: "auto-assign: Alma Dizdarević (Least Busy)", kind: "assign" },
      { id: "a3", at: `${T}T09:26:00`, actor: "Sistem", text: "status: Na čekanju → Dodijeljen", kind: "status" },
      { id: "a4", at: `${T}T10:45:00`, actor: "Alma Dizdarević", text: "pokrenuta sigurnosna akcija: tenant-wide izolacija poruke", kind: "security" },
    ],
    timeLogs: [{ id: "tl1", userId: "u-alma", minutes: 35, note: "Analiza headera, blokada domene, izolacija", at: `${T}T10:45:00` }],
    attachments: [{ id: "at1", name: "email-headers.eml", size: "38 KB", kind: "doc", classification: "Povjerljivo", byId: "u-mirza", at: `${T}T09:12:00` }],
  },
  {
    id: "EP-1041",
    title: "Zahtjev za pristup SAP FI modulu — unos faktura",
    serviceId: "sv-sap", originUnitId: "ou-fin", requesterId: "u-mirza",
    status: "PENDING", impact: "MEDIUM", urgency: "MEDIUM", priority: "MEDIUM",
    groupId: "g-fin", assigneeId: null,
    createdAt: `${T}T08:35:00`, updatedAt: `${T}T10:20:00`,
    respondBy: `${T}T16:35:00`, resolveBy: "2026-02-17T16:35:00",
    slaPaused: true, slaState: "OK", channel: "Portal", formVersion: "v5",
    watchers: ["u-faris"], timeSpentMin: 0,
    approvals: [
      { step: 1, approverId: "u-faris", role: "Vlasnik podataka (FI)", state: "APPROVED", at: `${T}T09:50:00`, note: "Uloga odgovara radnom mjestu." },
      { step: 2, approverId: "u-dzenana", role: "Menadžer usluga", state: "PENDING" },
    ],
    messages: [
      { id: "m1", at: `${T}T08:35:00`, authorId: "u-mirza", kind: "PUBLIC", body: "Treba mi uloga za unos ulaznih faktura u SAP FI od naredne sedmice — preuzimam posao od kolegice na odsustvu." },
      { id: "m2", at: `${T}T10:20:00`, authorId: "system", kind: "SYSTEM", body: "Odobrenje 1/2: Faris Mujić — odobreno. SLA tajmer pauziran (čeka se odobrenje 2/2)." },
    ],
    activities: [
      { id: "a1", at: `${T}T08:35:00`, actor: "RoutingService", text: "dodijeljen grupi Finansijski Servisi — exact pravilo", kind: "routing" },
      { id: "a2", at: `${T}T09:50:00`, actor: "Faris Mujić", text: "odobrio korak 1/2 (vlasnik podataka)", kind: "approval" },
      { id: "a3", at: `${T}T10:20:00`, actor: "Sistem", text: "SLA pauziran — čeka odobrenje (Pending Approval)", kind: "sla" },
    ],
    timeLogs: [],
    attachments: [],
  },
  {
    id: "EP-1039",
    title: "Pristup zajedničkom disku za tim Pravnih poslova",
    serviceId: "sv-disk", originUnitId: "ou-pravni", requesterId: "u-lamija",
    status: "WAITING_USER", impact: "LOW", urgency: "LOW", priority: "LOW",
    groupId: "g-l2", assigneeId: "u-lejla",
    createdAt: "2026-02-10T13:10:00", updatedAt: `${T}T09:05:00`,
    respondBy: "2026-02-10T17:10:00", resolveBy: "2026-02-16T16:00:00",
    slaPaused: true, slaState: "OK", channel: "Email", formVersion: "v3",
    watchers: [], timeSpentMin: 25,
    messages: [
      { id: "m1", at: "2026-02-10T13:10:00", authorId: "u-lamija", kind: "PUBLIC", body: "Treba nam pristup share-u \\\\fs01\\pravni-tim za tri nove kolege, nivo: čitanje i pisanje." },
      { id: "m2", at: `${T}T09:05:00`, authorId: "u-lejla", kind: "PUBLIC", body: "Vlasnik podataka je odobrio. Da li kolege trebaju i mapiranje diska pri prvoj prijavi (GPO), ili samo dozvole? Tiket čeka vaš odgovor — SLA je pauziran." },
    ],
    activities: [
      { id: "a1", at: "2026-02-10T13:12:00", actor: "RoutingService", text: "dodijeljen grupi IT Podrška L2 — exact pravilo", kind: "routing" },
      { id: "a2", at: `${T}T09:05:00`, actor: "Sistem", text: "status: U obradi → Čeka korisnika; SLA pauziran (waiting-for-user)", kind: "status" },
    ],
    timeLogs: [{ id: "tl1", userId: "u-lejla", minutes: 25, note: "Provjera vlasništva share-a, ACL priprema", at: "2026-02-10T15:40:00" }],
    attachments: [],
  },
  {
    id: "EP-1037",
    title: "Novi zaposlenik — priprema radne stanice (Razvoj)",
    serviceId: "sv-onboard", originUnitId: "ou-it-dev", requesterId: "u-dzenana",
    status: "IN_PROGRESS", impact: "MEDIUM", urgency: "MEDIUM", priority: "MEDIUM",
    groupId: "g-hr", assigneeId: "u-selma",
    createdAt: "2026-02-11T10:00:00", updatedAt: `${T}T08:40:00`,
    respondBy: "2026-02-11T18:00:00", resolveBy: "2026-02-18T16:00:00",
    slaPaused: false, slaState: "OK", channel: "Portal", formVersion: "v3",
    watchers: ["u-amar"], timeSpentMin: 55,
    messages: [
      { id: "m1", at: "2026-02-11T10:00:00", authorId: "u-dzenana", kind: "PUBLIC", body: "Novi backend inženjer počinje u ponedjeljak 16. 02. Potreban laptop + dock, domena, SAP HR pregled i pristup Git repozitorijima." },
      { id: "m2", at: `${T}T08:40:00`, authorId: "u-selma", kind: "PUBLIC", body: "Nalog je kreiran, oprema rezervisana iz skladišta. Čekam još samo potvrdu od Razvoja o listi repozitorija. Pod-tiket za IT opremu: EP-1038." },
    ],
    activities: [
      { id: "a1", at: "2026-02-11T10:01:00", actor: "Sistem", text: "tiket podijeljen: kreiran pod-tiket EP-1038 (nabavka opreme) — parent/child veza", kind: "edit" },
      { id: "a2", at: `${T}T08:40:00`, actor: "Selma Jahić", text: "zabilježeno vrijeme rada: 55 min", kind: "edit" },
    ],
    timeLogs: [{ id: "tl1", userId: "u-selma", minutes: 55, note: "Kreiranje naloga, rezervacija opreme", at: `${T}T08:40:00` }],
    attachments: [],
  },
  {
    id: "EP-1033",
    title: "Spore radne stanice u operaterskom centru Sarajevo",
    serviceId: "sv-incident", originUnitId: "ou-op-sa", requesterId: "u-nedim",
    status: "PENDING", impact: "HIGH", urgency: "MEDIUM", priority: "HIGH",
    groupId: null, assigneeId: null,
    createdAt: `${T}T10:52:00`, updatedAt: `${T}T10:52:00`,
    respondBy: `${T}T11:52:00`, resolveBy: "2026-02-13T11:00:00",
    slaPaused: false, slaState: "RISK", channel: "Telefon", formVersion: "v7",
    watchers: ["u-emir"], timeSpentMin: 0,
    messages: [
      { id: "m1", at: `${T}T10:52:00`, authorId: "u-nedim", kind: "PUBLIC", body: "Treći dan zaredom stanice u Sarajevu (grupa B, oko 12 mašina) rade izrazito sporo nakon pokretanja CRM-a. Ostali timovi se ne žale." },
      { id: "m2", at: `${T}T10:52:00`, authorId: "system", kind: "SYSTEM", body: "Routing: UNROUTED — nijedan uo u lancu nema pravilo za servis 'Incident — radna stanica'... [redakcija] Tiket je u neusmjerenom redu (vlasnik: SUPER_ADMIN)." },
    ],
    activities: [
      { id: "a1", at: `${T}T10:52:00`, actor: "RoutingService", text: "UNROUTED — grupa nije određena; tiket upućen u neusmjereni red", kind: "routing" },
    ],
    timeLogs: [],
    attachments: [{ id: "at1", name: "task-manager-snimak.png", size: "340 KB", kind: "img", classification: "Interno", byId: "u-nedim", at: `${T}T10:53:00` }],
  },
  {
    id: "EP-1031",
    title: "Izmjena podataka o bankovnom računu zaposlenika",
    serviceId: "sv-odsustvo", originUnitId: "ou-hr", requesterId: "u-lamija",
    status: "ASSIGNED", impact: "MEDIUM", urgency: "HIGH", priority: "HIGH",
    groupId: "g-hr", assigneeId: "u-selma",
    createdAt: "2026-02-11T14:20:00", updatedAt: `${T}T07:30:00`,
    respondBy: "2026-02-11T22:20:00", resolveBy: `${T}T14:20:00`,
    slaPaused: false, slaState: "BREACHED", channel: "Portal", formVersion: "v1",
    confidential: true,
    watchers: ["u-emir"], timeSpentMin: 20,
    messages: [
      { id: "m1", at: "2026-02-11T14:20:00", authorId: "u-lamija", kind: "PUBLIC", body: "Zaposlenik je zatražio izmjenu žiro-računa za isplatu. Potrebna hitna obrada prije obračuna (petak). Dokumentacija priložena kroz sigurni kanal." },
    ],
    activities: [
      { id: "a1", at: "2026-02-11T14:22:00", actor: "Sistem", text: "tiket označen kao povjerljiv — pristup ograničen (ACL)", kind: "security" },
      { id: "a2", at: `${T}T07:30:00`, actor: "Sistem", text: "SLA resolution prekoračen; eskalacija vlasniku grupe HR Servisi", kind: "sla" },
    ],
    timeLogs: [{ id: "tl1", userId: "u-selma", minutes: 20, note: "Verifikacija dokumentacije", at: "2026-02-11T15:00:00" }],
    attachments: [],
  },
  {
    id: "EP-1028",
    title: "Neispravan projektor u sali B2 — treperi slika",
    serviceId: "sv-projektor", originUnitId: "ou-dir", requesterId: "u-haris",
    status: "RESOLVED", impact: "LOW", urgency: "MEDIUM", priority: "LOW",
    groupId: "g-sys", assigneeId: "u-adnan",
    createdAt: "2026-02-09T09:15:00", updatedAt: "2026-02-11T16:00:00",
    respondBy: "2026-02-09T13:15:00", resolveBy: "2026-02-13T16:00:00",
    slaPaused: false, slaState: "OK", channel: "Portal", formVersion: "v2",
    watchers: [], timeSpentMin: 90, closeCode: "Riješeno — zamjena dijela",
    messages: [
      { id: "m1", at: "2026-02-09T09:15:00", authorId: "u-haris", kind: "PUBLIC", body: "Projektor u B2 treperi nakon 10-15 minuta rada. Sutra imamo prezentaciju za upravu u toj sali." },
      { id: "m2", at: "2026-02-11T16:00:00", authorId: "u-adnan", kind: "PUBLIC", body: "Zamijenjen HDMI pojačivač i lampa kalibrirana. Testirano 45 min bez prekida. Sala je spremna za sutrašnju prezentaciju." },
    ],
    activities: [
      { id: "a1", at: "2026-02-11T16:00:00", actor: "Adnan Begić", text: "status: U obradi → Riješen (close code: zamjena dijela)", kind: "status" },
    ],
    timeLogs: [{ id: "tl1", userId: "u-adnan", minutes: 90, note: "Zamjena HDMI pojačivača, kalibracija", at: "2026-02-11T15:30:00" }],
    attachments: [],
  },
  {
    id: "EP-1024",
    title: "Reset lozinke — zaključan domena nalog",
    serviceId: "sv-lozinka", originUnitId: "ou-prodaja", requesterId: "u-haris",
    status: "CLOSED", impact: "LOW", urgency: "HIGH", priority: "MEDIUM",
    groupId: "g-l1", assigneeId: "u-amar",
    createdAt: "2026-02-05T08:10:00", updatedAt: "2026-02-05T09:02:00",
    respondBy: "2026-02-05T09:10:00", resolveBy: "2026-02-06T16:00:00",
    slaPaused: false, slaState: "OK", channel: "Telefon", formVersion: "v2",
    watchers: [], timeSpentMin: 10, csat: 5, closeCode: "Riješeno na prvi kontakt",
    messages: [
      { id: "m1", at: "2026-02-05T08:52:00", authorId: "u-amar", kind: "PUBLIC", body: "Nalog je otključan i privremena lozinka poslana SMS-om. Molim promijenite je pri prvoj prijavi." },
    ],
    activities: [
      { id: "a1", at: "2026-02-05T09:02:00", actor: "Amar Softić", text: "status: Riješen → Zatvoren (FCR)", kind: "status" },
      { id: "a2", at: "2026-02-05T12:05:00", actor: "Sistem", text: "CSAT primljen: 5/5 — 'Brzo i ljubazno'", kind: "edit" },
    ],
    timeLogs: [{ id: "tl1", userId: "u-amar", minutes: 10, note: "Otključavanje naloga", at: "2026-02-05T08:52:00" }],
    attachments: [],
  },
  {
    id: "EP-1040",
    title: "Refundacija putnog naloga — relacija Sarajevo–Beč",
    serviceId: "sv-refund", originUnitId: "ou-prodaja", requesterId: "u-haris",
    status: "WAITING_USER", impact: "LOW", urgency: "LOW", priority: "LOW",
    groupId: "g-fin", assigneeId: "u-faris",
    createdAt: "2026-02-10T11:30:00", updatedAt: `${T}T10:00:00`,
    respondBy: "2026-02-10T19:30:00", resolveBy: "2026-02-17T16:00:00",
    slaPaused: true, slaState: "OK", channel: "Portal", formVersion: "v2",
    watchers: [], timeSpentMin: 30,
    messages: [
      { id: "m2", at: `${T}T10:00:00`, authorId: "u-faris", kind: "PUBLIC", body: "Nedostaje boarding pass za povratni let. Pošaljite ga ovdje ili na email, pa nastavljamo obračun. Ako ne odgovorite u 5 radnih dana, tiket se automatski zatvara (uz opciju ponovnog otvaranja)." },
    ],
    activities: [
      { id: "a1", at: `${T}T10:00:00`, actor: "Sistem", text: "status: U obradi → Čeka korisnika; SLA pauziran; auto-close za 5 radnih dana", kind: "status" },
    ],
    timeLogs: [{ id: "tl1", userId: "u-faris", minutes: 30, note: "Kontrola putnog naloga i priloga", at: `${T}T10:00:00` }],
    attachments: [{ id: "at1", name: "putni-nalog-2026-014.pdf", size: "96 KB", kind: "pdf", classification: "Povjerljivo", byId: "u-haris", at: "2026-02-10T11:31:00" }],
  },
  {
    id: "EP-1038",
    title: "Onboarding: nabavka laptopa za novog inženjera",
    serviceId: "sv-nabavka", originUnitId: "ou-it-dev", requesterId: "u-dzenana",
    status: "ASSIGNED", impact: "MEDIUM", urgency: "MEDIUM", priority: "MEDIUM",
    groupId: "g-fin", assigneeId: "u-faris",
    createdAt: "2026-02-11T10:01:00", updatedAt: `${T}T09:35:00`,
    respondBy: "2026-02-11T18:00:00", resolveBy: "2026-02-16T16:00:00",
    slaPaused: false, slaState: "OK", channel: "Portal", formVersion: "v6",
    watchers: ["u-selma"], timeSpentMin: 40,
    messages: [
      { id: "m1", at: "2026-02-11T10:01:00", authorId: "system", kind: "SYSTEM", body: "Pod-tiket kreiran dijeljenjem iz EP-1037 (roditelj). Odobrenja: 1/2 završeno, 2/2 u toku." },
      { id: "m2", at: `${T}T09:35:00`, authorId: "u-faris", kind: "PUBLIC", body: "Cijena je unutar CAPEX praga za standardni dev laptop. Nakon odobrenja menadžera usluga ide narudžba dobavljaču — rok isporuke 2 radna dana." },
    ],
    activities: [
      { id: "a1", at: "2026-02-11T10:01:00", actor: "Sistem", text: "kreiran dijeljenjem iz EP-1037", kind: "edit" },
      { id: "a2", at: "2026-02-11T13:15:00", actor: "Dženana Softić", text: "odobrenje 1/2 (budžetska linija CAPEX 2026)", kind: "approval" },
    ],
    timeLogs: [{ id: "tl1", userId: "u-faris", minutes: 40, note: "Upit dobavljaču, poređenje cijena", at: `${T}T09:35:00` }],
    attachments: [{ id: "at1", name: "ponuda-laptop-dev.xlsx", size: "18 KB", kind: "xls", classification: "Interno", byId: "u-faris", at: `${T}T09:35:00` }],
  },
  {
    id: "EP-1035",
    title: "Korekcija godišnjeg odmora — pogrešan broj dana",
    serviceId: "sv-odsustvo", originUnitId: "ou-hr", requesterId: "u-sanja",
    status: "RESOLVED", impact: "LOW", urgency: "MEDIUM", priority: "LOW",
    groupId: "g-hr", assigneeId: "u-selma",
    createdAt: "2026-02-09T15:40:00", updatedAt: "2026-02-10T12:00:00",
    respondBy: "2026-02-10T08:00:00", resolveBy: "2026-02-13T16:00:00",
    slaPaused: false, slaState: "OK", channel: "Portal", formVersion: "v1",
    watchers: [], timeSpentMin: 15, closeCode: "Riješeno",
    messages: [
      { id: "m1", at: "2026-02-10T12:00:00", authorId: "u-selma", kind: "PUBLIC", body: "Ispravljeno: bilo je evidentirano 12 umjesto 15 dana iz prenosa 2025. Stanje u HR sistemu je sada tačno; promjena je zabilježena u audit logu." },
    ],
    activities: [{ id: "a1", at: "2026-02-10T12:00:00", actor: "Selma Jahić", text: "status: U obradi → Riješen", kind: "status" }],
    timeLogs: [{ id: "tl1", userId: "u-selma", minutes: 15, note: "Korekcija + audit zapis", at: "2026-02-10T12:00:00" }],
    attachments: [],
  },
  {
    id: "EP-1045",
    title: "Prekid rada Outlook kalendara nakon update-a",
    serviceId: "sv-incident", originUnitId: "ou-dir", requesterId: "u-nedim",
    status: "PENDING", impact: "MEDIUM", urgency: "HIGH", priority: "HIGH",
    groupId: "g-l1", assigneeId: null,
    createdAt: `${T}T11:05:00`, updatedAt: `${T}T11:05:00`,
    respondBy: `${T}T15:05:00`, resolveBy: "2026-02-13T11:00:00",
    slaPaused: false, slaState: "OK", channel: "Email", formVersion: "v7",
    watchers: [], timeSpentMin: 0,
    messages: [
      { id: "m1", at: `${T}T11:05:00`, authorId: "u-nedim", kind: "PUBLIC", body: "Nakon jutrošnjeg O365 update-a kalendarski pregled se ruši na 'Processing...'. Ostatak Outlooka radi normalno." },
    ],
    activities: [{ id: "a1", at: `${T}T11:05:00`, actor: "RoutingService", text: "dodijeljen grupi IT Podrška L1 — exact pravilo", kind: "routing" }],
    timeLogs: [],
    attachments: [],
  },
  {
    id: "EP-1044",
    title: "Tražim prenos licenciranog AutoCAD profila na novu stanicu",
    serviceId: "sv-autocad", originUnitId: "ou-it-dev", requesterId: "u-haris",
    status: "CLOSED", impact: "LOW", urgency: "LOW", priority: "LOW",
    groupId: "g-l1", assigneeId: "u-amar",
    createdAt: "2026-01-28T10:00:00", updatedAt: "2026-01-29T14:00:00",
    respondBy: "2026-01-28T18:00:00", resolveBy: "2026-02-02T16:00:00",
    slaPaused: false, slaState: "OK", channel: "Portal", formVersion: "v1",
    watchers: [], timeSpentMin: 35, csat: 4, closeCode: "Riješeno uz napomenu",
    messages: [
      { id: "m1", at: "2026-01-29T14:00:00", authorId: "u-amar", kind: "PUBLIC", body: "Profil prenesen. Napomena: servis se ukinjava 15. 02. — nove instalacije idu kroz 'Nabavka IT opreme' dok traje migracija licencnog servera." },
    ],
    activities: [{ id: "a1", at: "2026-01-29T14:00:00", actor: "Amar Softić", text: "status: Riješen → Zatvoren", kind: "status" }],
    timeLogs: [{ id: "tl1", userId: "u-amar", minutes: 35, note: "Prenos profila i lokalne keše", at: "2026-01-29T13:40:00" }],
    attachments: [],
  },
  {
    id: "EP-1021",
    title: "Email se ne sinhronizuje na službenom telefonu",
    serviceId: "sv-lozinka", originUnitId: "ou-op-mo", requesterId: "u-sanja",
    status: "CLOSED", impact: "LOW", urgency: "MEDIUM", priority: "LOW",
    groupId: "g-l1", assigneeId: "u-amar",
    createdAt: "2026-02-03T09:20:00", updatedAt: "2026-02-03T11:10:00",
    respondBy: "2026-02-03T10:20:00", resolveBy: "2026-02-04T16:00:00",
    slaPaused: false, slaState: "OK", channel: "Portal", formVersion: "v2",
    watchers: [], timeSpentMin: 20, csat: 5, closeCode: "Riješeno na prvi kontakt",
    messages: [
      { id: "m1", at: "2026-02-03T11:05:00", authorId: "u-amar", kind: "PUBLIC", body: "Moderna autentikacija je ponovo potvrđena na uređaju — sinhronizacija radi. Napomena: stari basic auth profil je uklonjen." },
    ],
    activities: [{ id: "a1", at: "2026-02-03T11:10:00", actor: "Amar Softić", text: "status: Riješen → Zatvoren (FCR)", kind: "status" }],
    timeLogs: [{ id: "tl1", userId: "u-amar", minutes: 20, note: "Re-auth O365 profila na telefonu", at: "2026-02-03T11:05:00" }],
    attachments: [],
  },
];

export const ticketById = (id: string) => TICKETS.find((t) => t.id === id);

/* Sintetička razgovorna niska za tikete bez detalja */
export function ensureMessages(t: Ticket): TicketMessage[] {
  return t.messages;
}

/* ------------------------------------------------------------------ */
/* Baza znanja                                                         */
/* ------------------------------------------------------------------ */

export interface KbArticle {
  id: string;
  code: string;
  title: string;
  categoryId: string;
  excerpt: string;
  views: number;
  helpfulPct: number;
  status: "PUBLISHED" | "REVIEW" | "DRAFT";
  owner: string;
  updatedAt: string;
  reviewDue: string;
  intercepts: number; // koliko je tiketa spriječeno interceptom
  tags: string[];
}

export const KB_STATUS_META: Record<KbArticle["status"], { label: string; tone: "success" | "warning" | "neutral" }> = {
  PUBLISHED: { label: "Objavljen", tone: "success" },
  REVIEW: { label: "Za pregled", tone: "warning" },
  DRAFT: { label: "Nacrt", tone: "neutral" },
};

export const KB_ARTICLES: KbArticle[] = [
  {
    id: "kb-01", code: "KB-1042", title: "Reset lozinke kroz self-service portal (bez poziva)", categoryId: "cat-access",
    excerpt: "Korak-po-korak upute za otključavanje naloga i postavljanje nove lozinke preko SSPR portala, uključujući registraciju MFA metoda.",
    views: 1840, helpfulPct: 94, status: "PUBLISHED", owner: "Amar Softić",
    updatedAt: "2026-01-30T10:00:00", reviewDue: "2026-04-30T00:00:00", intercepts: 212, tags: ["lozinka", "sspr", "mfa"],
  },
  {
    id: "kb-02", code: "KB-1037", title: "VPN konekcija na Windows 11 — greška 809 i rješenja", categoryId: "cat-infra",
    excerpt: "Najčešći uzroci greške 809: blokirani UDP 500/4500, zastarjeli klijent ili CRL lista. Uključuje skriptu za reset klijenta.",
    views: 1266, helpfulPct: 88, status: "PUBLISHED", owner: "Lejla Hadžić",
    updatedAt: "2026-02-08T14:00:00", reviewDue: "2026-05-08T00:00:00", intercepts: 148, tags: ["vpn", "mreža", "greška-809"],
  },
  {
    id: "kb-05", code: "KB-1021", title: "Kako tražiti pristup aplikacijama i share-ovima", categoryId: "cat-access",
    excerpt: "Koji servis odabrati u katalogu, koja odobrenja su potrebna i koliko traje proces — sa uputama za vlasnike podataka.",
    views: 987, helpfulPct: 91, status: "PUBLISHED", owner: "Emir Kovač",
    updatedAt: "2026-01-12T09:00:00", reviewDue: "2026-07-12T00:00:00", intercepts: 137, tags: ["pristup", "sap", "share"],
  },
  {
    id: "kb-07", code: "KB-1014", title: "Prijava sumnjivog email-a — phishing u 3 klika", categoryId: "cat-it",
    excerpt: "Kako prepoznati phishing, koristiti dugme 'Prijavi' u Outlooku i šta se dešava nakon prijave u SOC.",
    views: 1502, helpfulPct: 96, status: "PUBLISHED", owner: "Alma Dizdarević",
    updatedAt: "2026-02-01T11:00:00", reviewDue: "2026-08-01T00:00:00", intercepts: 96, tags: ["phishing", "sigurnost", "email"],
  },
  {
    id: "kb-03", code: "KB-0998", title: "Politika refundacije putnih troškova (2026)", categoryId: "cat-fin",
    excerpt: "Koje priloge priložiti, rokovi podnošenja i obračun dnevnica za domaća i inozemna putovanja.",
    views: 843, helpfulPct: 85, status: "REVIEW", owner: "Faris Mujić",
    updatedAt: "2025-11-20T10:00:00", reviewDue: "2026-02-20T00:00:00", intercepts: 61, tags: ["putni troškovi", "refundacija"],
  },
  {
    id: "kb-04", code: "KB-0991", title: "Priprema radne stanice za novog zaposlenika — checklist", categoryId: "cat-hr",
    excerpt: "Standardna checklista za IT i HR: nalog, oprema, pristupi, prvi dan. Predviđeno vrijeme isporuke: 3 radna dana.",
    views: 402, helpfulPct: 92, status: "PUBLISHED", owner: "Selma Jahić",
    updatedAt: "2026-01-05T10:00:00", reviewDue: "2026-04-05T00:00:00", intercepts: 44, tags: ["onboarding", "hr", "oprema"],
  },
  {
    id: "kb-06", code: "KB-0976", title: "Godišnji odmor — evidencija i česte ispravke", categoryId: "cat-hr",
    excerpt: "Kako se vodi prenos dana, ko može korigovati evidenciju i rokovi za zahtjeve.",
    views: 655, helpfulPct: 79, status: "REVIEW", owner: "Selma Jahić",
    updatedAt: "2025-12-15T10:00:00", reviewDue: "2026-02-15T00:00:00", intercepts: 38, tags: ["odmor", "hr"],
  },
  {
    id: "kb-08", code: "KB-0955", title: "Postavljanje službenog email-a na mobilni uređaj", categoryId: "cat-it",
    excerpt: "O365 moderna autentikacija na Android/iOS, uklanjanje starih profila i namjenske aplikacije.",
    views: 1104, helpfulPct: 87, status: "DRAFT", owner: "Amar Softić",
    updatedAt: "2026-02-10T16:00:00", reviewDue: "2026-03-10T00:00:00", intercepts: 52, tags: ["email", "mobilni", "o365"],
  },
];

/* ------------------------------------------------------------------ */
/* SLA — kalendari, profili, pravila                                   */
/* ------------------------------------------------------------------ */

export interface SlaRule {
  priority: Priority;
  responseMin: number;
  resolutionH: number;
}

export interface SlaProfile {
  id: string;
  code: string;
  name: string;
  description: string;
  calendarId: string;
  servicesCount: number;
  activeContracts: number;
  rules: SlaRule[];
}

export const SLA_PROFILES: SlaProfile[] = [
  {
    id: "sla-inc", code: "INCIDENT", name: "Incident — proizvodni uticaj", calendarId: "cal-247",
    description: "Za kvarove koji blokiraju poslovni proces. Tajmeri rade 24/7 za kritične, radno vrijeme za ostale.",
    servicesCount: 3, activeContracts: 18,
    rules: [
      { priority: "CRITICAL", responseMin: 30, resolutionH: 12 },
      { priority: "HIGH", responseMin: 60, resolutionH: 24 },
      { priority: "MEDIUM", responseMin: 240, resolutionH: 48 },
      { priority: "LOW", responseMin: 480, resolutionH: 96 },
    ],
  },
  {
    id: "sla-access", code: "ACCESS", name: "Pristup i nalozi", calendarId: "cal-bh",
    description: "Zahtjevi za naloge i dozvole; obuhvata vrijeme potrebno za odobrenja (pauza automatska).",
    servicesCount: 3, activeContracts: 11,
    rules: [
      { priority: "CRITICAL", responseMin: 60, resolutionH: 8 },
      { priority: "HIGH", responseMin: 240, resolutionH: 24 },
      { priority: "MEDIUM", responseMin: 480, resolutionH: 72 },
      { priority: "LOW", responseMin: 960, resolutionH: 120 },
    ],
  },
  {
    id: "sla-std", code: "STANDARD_REQUEST", name: "Standardni zahtjev", calendarId: "cal-bh",
    description: "Uobičajeni servisni zahtjevi bez proizvodnog uticaja.",
    servicesCount: 2, activeContracts: 9,
    rules: [
      { priority: "CRITICAL", responseMin: 120, resolutionH: 24 },
      { priority: "HIGH", responseMin: 480, resolutionH: 48 },
      { priority: "MEDIUM", responseMin: 960, resolutionH: 96 },
      { priority: "LOW", responseMin: 1440, resolutionH: 168 },
    ],
  },
  {
    id: "sla-fin", code: "FINANCE", name: "Finansijski procesi", calendarId: "cal-bh",
    description: "Refundacije i nabavka; usklađeno s ciklusima obračuna i pragovima odobrenja.",
    servicesCount: 2, activeContracts: 8,
    rules: [
      { priority: "CRITICAL", responseMin: 240, resolutionH: 24 },
      { priority: "HIGH", responseMin: 480, resolutionH: 72 },
      { priority: "MEDIUM", responseMin: 960, resolutionH: 120 },
      { priority: "LOW", responseMin: 1920, resolutionH: 240 },
    ],
  },
  {
    id: "sla-hr", code: "HR", name: "HR servisi", calendarId: "cal-bh",
    description: "Zapošljavanje i odsustva; povjerljivi tiketi imaju odvojene tajmere eskalacije.",
    servicesCount: 2, activeContracts: 5,
    rules: [
      { priority: "CRITICAL", responseMin: 120, resolutionH: 24 },
      { priority: "HIGH", responseMin: 480, resolutionH: 48 },
      { priority: "MEDIUM", responseMin: 960, resolutionH: 96 },
      { priority: "LOW", responseMin: 1920, resolutionH: 168 },
    ],
  },
];

export interface BhCalendar {
  id: string;
  name: string;
  schedule: string;
  timezone: string;
  holidays: { date: string; name: string }[];
}

export const CALENDARS: BhCalendar[] = [
  {
    id: "cal-bh", name: "Radno vrijeme EP (BiH)", schedule: "pon–pet · 08:00–16:00", timezone: "Europe/Sarajevo (UTC+1)",
    holidays: [
      { date: "2026-03-01", name: "Dan nezavisnosti BiH" },
      { date: "2026-05-01", name: "Praznik rada" },
      { date: "2026-11-25", name: "Dan državnosti BiH" },
    ],
  },
  {
    id: "cal-247", name: "Kritične usluge 24/7", schedule: "0–24 · svaki dan", timezone: "Europe/Sarajevo (UTC+1)",
    holidays: [],
  },
];

export const SLA_ESCALATIONS = [
  { id: "esc-1", at: "75% resolution vremena", action: "Upozorenje agentu i vlasniku grupe (in-app)", tone: "warning" as const, places: "Badge + filter 'Pod rizikom'" },
  { id: "esc-2", at: "Prekoračenje response", action: "Eskalacija vlasniku grupe; tiket ide na vrh inboxa", tone: "danger" as const, places: "Badge 'Prekoračen'" },
  { id: "esc-3", at: "Prekoračenje resolution", action: "Eskalacija menadžeru usluga + stavka na bottleneck izvještaju", tone: "danger" as const, places: "Nadzorna ploča" },
];

export const SLA_PAUSES = [
  { cond: "Čeka korisnika", note: "Resolution tajmer pauziran do odgovora; auto-close nakon 5 radnih dana (reopen do 10 dana)." },
  { cond: "Pending Approval", note: "Tajmer pauziran dok traje lanac odobrenja (1–3 koraka, po servisu)." },
];

/* ------------------------------------------------------------------ */
/* Obavještenja, change log, integracioni red                          */
/* ------------------------------------------------------------------ */

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  at: string;
  unread: boolean;
  kind: "ticket" | "sla" | "approval" | "system";
  routeTo?: string;
}

export const NOTIFICATIONS: AppNotification[] = [
  { id: "n1", title: "SLA prekoračenje: EP-1031", body: "Resolution rok prekoračen prije 3 sata — povjerljiv tiket, HR Servisi.", at: "2026-02-12T07:30:00", unread: true, kind: "sla", routeTo: "ticket:EP-1031" },
  { id: "n2", title: "Čeka vaše odobrenje (2/2)", body: "EP-1041 · Pristup SAP FI modulu — Mirza Delić.", at: "2026-02-12T10:20:00", unread: true, kind: "approval", routeTo: "ticket:EP-1041" },
  { id: "n3", title: "Novi tiket u neusmjerenom redu", body: "EP-1033 · Incident radne stanice, Operateri/Sarajevo.", at: "2026-02-12T10:52:00", unread: true, kind: "ticket", routeTo: "inbox" },
  { id: "n4", title: "Routing pravilo izmijenjeno", body: "Lejla Hadžić: (Tuzla + VPN) → IT Podrška L2.", at: "2026-02-09T16:22:00", unread: false, kind: "system", routeTo: "routing" },
  { id: "n5", title: "Email red: 1 zadatak u DLQ", body: "BullMQ 'email-out' — maksimalan broj pokušaja dostignut.", at: "2026-02-11T22:14:00", unread: false, kind: "system", routeTo: "admin:ops" },
  { id: "n6", title: "Tiket EP-1028 riješen", body: "Adnan Begić: zamjena dijela — sala B2 spremna.", at: "2026-02-11T16:00:00", unread: false, kind: "ticket", routeTo: "ticket:EP-1028" },
];

export interface ChangeLogEntry {
  id: string;
  at: string;
  by: string;
  entity: string;
  reason: string;
  diff: { field: string; before: string; after: string }[];
}

export const CHANGE_LOG: ChangeLogEntry[] = [
  {
    id: "cl-1", at: "2026-02-09T16:22:00", by: "Lejla Hadžić", entity: "Routing pravilo RR-11",
    reason: "Tuzla VPN incidenti zahtijevaju L2 zbog firewall promjena",
    diff: [
      { field: "Grupa", before: "— (nije postojalo)", after: "IT Podrška L2" },
      { field: "Rezolucija (Tuzla, VPN)", before: "UNROUTED", after: "EXACT · dubina 0" },
    ],
  },
  {
    id: "cl-2", at: "2026-02-09T16:25:00", by: "Lejla Hadžić", entity: "Routing pravilo RR-12",
    reason: "IT odjel rješava vlastitu infrastrukturu",
    diff: [
      { field: "Grupa", before: "— (nije postojalo)", after: "Sistem Inženjeri" },
      { field: "Rezolucija (IT odjel, VPN)", before: "PARENT_FALLBACK → IT Podrška L2", after: "EXACT → Sistem Inženjeri" },
    ],
  },
  {
    id: "cl-3", at: "2026-02-06T10:05:00", by: "Emir Kovač", entity: "Postavka private.ticket.unroutedQueue",
    reason: "Vidljivost neusmjerenih tiketa na nadzornoj ploči",
    diff: [{ field: "enabled", before: "false", after: "true" }],
  },
  {
    id: "cl-4", at: "2026-02-02T08:31:00", by: "Adnan Begić", entity: "Routing pravilo RR-10",
    reason: "AV oprema ide sistem inženjerima, ne L1",
    diff: [
      { field: "Grupa", before: "IT Podrška L1", after: "Sistem Inženjeri" },
      { field: "Fallback putanja", before: "Root → g-l1", after: "EXACT · dubina 0" },
    ],
  },
];

export interface IntegrationJob {
  id: string;
  name: string;
  queue: string;
  status: "COMPLETED" | "ACTIVE" | "WAITING" | "FAILED" | "DELAYED";
  attempts: number;
  maxAttempts: number;
  at: string;
  note?: string;
}

export const INTEGRATION_JOBS: IntegrationJob[] = [
  { id: "job-01", name: "email-out · obavještenje EP-1042", queue: "email-out", status: "COMPLETED", attempts: 1, maxAttempts: 5, at: "2026-02-12T10:45:04" },
  { id: "job-02", name: "ad-sync · manual_only očitavanje", queue: "ad-sync", status: "COMPLETED", attempts: 1, maxAttempts: 3, at: "2026-02-12T06:00:00", note: "throttle 15 min, cache 24 h" },
  { id: "job-03", name: "email-out · eskalacija EP-1031", queue: "email-out", status: "FAILED", attempts: 5, maxAttempts: 5, at: "2026-02-11T22:14:00", note: "SMTP 5.7.60 — token istekao; u DLQ, čeka retry" },
  { id: "job-04", name: "sla-tick · provjera tajmera", queue: "sla-engine", status: "ACTIVE", attempts: 1, maxAttempts: 2, at: "2026-02-12T11:40:00" },
  { id: "job-05", name: "teams-stub · notifikacija (feature flag)", queue: "teams-stub", status: "DELAYED", attempts: 0, maxAttempts: 1, at: "2026-02-12T11:30:00", note: "stub — bez isporuke, samo audit" },
  { id: "job-06", name: "audit-hash · lančana provjera", queue: "audit", status: "WAITING", attempts: 0, maxAttempts: 2, at: "2026-02-12T12:00:00" },
];

export const JOB_STATUS_META: Record<IntegrationJob["status"], { label: string; tone: "success" | "primary" | "neutral" | "danger" | "info" }> = {
  COMPLETED: { label: "Završen", tone: "success" },
  ACTIVE: { label: "Aktivan", tone: "primary" },
  WAITING: { label: "Čeka", tone: "info" },
  FAILED: { label: "Neuspješan", tone: "danger" },
  DELAYED: { label: "Odgođen", tone: "neutral" },
};

/* ------------------------------------------------------------------ */
/* Sačuvani pogledi + serije za grafove                                */
/* ------------------------------------------------------------------ */

export const SAVED_VIEWS = [
  { id: "v1", name: "Moji otvoreni", count: 4, query: "assignee:ja status:!zatvoren" },
  { id: "v2", name: "Kritični bez vlasnika", count: 2, query: "priority:kritican assignee:prazno" },
  { id: "v3", name: "SLA pod rizikom", count: 5, query: "sla:rizik" },
  { id: "v4", name: "Čeka korisnika > 3 dana", count: 3, query: "status:ceka updated:<3d" },
  { id: "v5", name: "Ovaj mjesec — Prodaja", count: 8, query: "ou:prodaja created:mjesec" },
];

export const VOLUME_14D = [
  { d: "30. 01", created: 9, resolved: 7 },
  { d: "31. 01", created: 7, resolved: 8 },
  { d: "01. 02", created: 4, resolved: 5 },
  { d: "02. 02", created: 11, resolved: 8 },
  { d: "03. 02", created: 13, resolved: 11 },
  { d: "04. 02", created: 10, resolved: 12 },
  { d: "05. 02", created: 8, resolved: 9 },
  { d: "06. 02", created: 5, resolved: 6 },
  { d: "07. 02", created: 3, resolved: 4 },
  { d: "08. 02", created: 12, resolved: 9 },
  { d: "09. 02", created: 14, resolved: 10 },
  { d: "10. 02", created: 12, resolved: 13 },
  { d: "11. 02", created: 9, resolved: 10 },
  { d: "12. 02", created: 6, resolved: 4 },
];

export const ACTIVITY_FEED = [
  { id: "f1", at: "2026-02-12T11:20:00", who: "Aida Čengić", what: "dodala komentar na EP-1043 (VPN — Tuzla)", tone: "primary" as const },
  { id: "f2", at: "2026-02-12T11:05:00", who: "Nedim Krupalija", what: "kreirao EP-1045 — Outlook kalendar", tone: "info" as const },
  { id: "f3", at: "2026-02-12T10:52:00", who: "RoutingService", what: "EP-1033 → UNROUTED red (nema pravila)", tone: "danger" as const },
  { id: "f4", at: "2026-02-12T10:20:00", who: "Sistem", what: "SLA pauziran na EP-1041 (čeka odobrenje 2/2)", tone: "warning" as const },
  { id: "f5", at: "2026-02-12T09:50:00", who: "Faris Mujić", what: "odobrio korak 1/2 na EP-1041", tone: "success" as const },
  { id: "f6", at: "2026-02-12T08:14:00", who: "Lejla Hadžić", what: "objavila javni odgovor na EP-1043", tone: "primary" as const },
  { id: "f7", at: "2026-02-12T07:30:00", who: "Sistem", what: "SLA prekoračenje EP-1031 — eskalacija HR", tone: "danger" as const },
];

/* Policy packovi — aditivne dodjele dozvola (nikad SuperAdmin) */
export const POLICY_PACKS = [
  {
    code: "IT",
    description: "Standardni paket za IT osoblje: ticket rad, KB pisanje, L1/L2 opsezi.",
    permissions: 24,
    assigned: 13,
  },
  {
    code: "HR",
    description: "HR servisi + povjerljivi tiketi u HR opsegu; bez pristupa IT alatima.",
    permissions: 14,
    assigned: 4,
  },
  {
    code: "FIN",
    description: "Finansijski servisi, odobrenja troškova i izvještaji vlastitog opsega.",
    permissions: 16,
    assigned: 5,
  },
];

/* Dodaci (addon switch katalog — install wizard korak 5) */
export const ADDONS = [
  { key: "addon.sla", name: "SLA modul", desc: "BH kalendari, tajmeri, eskalacije", enabled: true, locked: false },
  { key: "addon.email", name: "Email kanal (O365)", desc: "Internal-only isporuka kroz SMTP postavke", enabled: true, locked: false },
  { key: "addon.teams", name: "Teams obavještenja", desc: "Stub — bez isporuke, samo audit zapis", enabled: false, locked: false },
  { key: "addon.csat", name: "CSAT anketa", desc: "Ocjena 1–5 nakon zatvaranja tiketa", enabled: true, locked: false },
  { key: "addon.autoassign", name: "Auto-assign", desc: "Least Busy / Round Robin po grupi", enabled: true, locked: false },
  { key: "addon.edge", name: "Edge ekstenzija", desc: "WS + throttled polling, redacted toasts", enabled: false, locked: false },
];

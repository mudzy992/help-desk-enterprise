import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findTicketTranslationIssues,
  ticketTranslationReferences,
} from "./check-ticket-translation-keys.mjs";

const locales = {
  bs: {
    tickets: {
      title: "Naslov",
      status: { PENDING: "Na čekanju" },
      servicePicker: { resultCount_one: "{{count}} usluga" },
      activity: { events: { ticket_created: "Tiket je kreiran" } },
    },
  },
  en: {
    tickets: {
      title: "Title",
      status: { PENDING: "Pending" },
      servicePicker: { resultCount_other: "{{count}} services" },
      activity: { events: { ticket_created: "Ticket created" } },
    },
  },
};

test("pronalazi statičke ključeve i prefikse koji zavise od statusa", () => {
  const source = [
    't("tickets.title");',
    'translateText(t, "tickets.status.PENDING");',
    't("tickets.servicePicker.resultCount", { count: 2 });',
    't(`tickets.activity.events.${action}`);',
  ].join("\n");
  const references = ticketTranslationReferences(source);
  assert.deepEqual([...references.keys].sort(), [
    "tickets.servicePicker.resultCount",
    "tickets.status.PENDING",
    "tickets.title",
  ]);
  assert.deepEqual([...references.prefixes], ["tickets.activity.events"]);
  assert.deepEqual(findTicketTranslationIssues('t("tickets.title")', locales), []);
  assert.deepEqual(
    findTicketTranslationIssues('t("tickets.servicePicker.resultCount")', locales),
    [],
  );
});

test("prijavljuje ključ koji nedostaje u jednom jeziku i prefiks koji ne postoji", () => {
  const source = [
    't("tickets.status.CLOSED");',
    't(`tickets.activity.unknown.${action}`);',
  ].join("\n");
  const issues = findTicketTranslationIssues(source, locales);
  assert.deepEqual(issues, [
    { locale: "bs", kind: "key", reference: "tickets.status.CLOSED" },
    { locale: "bs", kind: "prefix", reference: "tickets.activity.unknown" },
    { locale: "en", kind: "key", reference: "tickets.status.CLOSED" },
    { locale: "en", kind: "prefix", reference: "tickets.activity.unknown" },
  ]);
});

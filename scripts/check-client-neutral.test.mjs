// Tests for the client-neutral guard itself (Paket 4.1a §6.4). Every forbidden
// form has one positive example; the negatives are the words that already came
// up as false positives, so a widened rule cannot silently start flagging them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { clientFormsIn } from "./check-client-neutral.mjs";

const forbidden = [
  "EP·HelpDesk",
  "EPBIH",
  "EPBiH",
  "elektroprivreda",
  "EP HelpDesk",
  "ep-helpdesk.theme.mode",
  "X-EPHD-Ticket",
  "ephd.entra.configuration",
  "ep-hd",
  "ep_hd",
  "ep hd",
  "helpdesk@ep.ba",
  "https://ep.ba/portal",
  "ops@ep-grupa.ba",
  "EP\\ahodzic",
  "EP/Sarajevo",
  "/EP",
  "Korisnici EP",
  "EP_",
  "_EP_",
  "EP-1043",
  "ep-ticket-attachments-",
];

const allowed = [
  "step",
  "REPORT",
  "help desk",
  "helpdesk",
  "deep",
  "epoha",
  "example.com",
  "service-desk.ticket-attachments-",
  "HD-1043",
  // The SRS file name is an allowed fragment and is stripped from the line in
  // `scan()` before the decision runs, so `clientFormsIn` itself still matches it.
];

test("flags every form of the client name", () => {
  for (const value of forbidden) {
    assert.ok(clientFormsIn(value).length > 0, `expected a finding in: ${value}`);
  }
});

test("does not flag neutral text", () => {
  for (const value of allowed) {
    assert.deepEqual(clientFormsIn(value), [], `unexpected finding in: ${value}`);
  }
});

test("the bare short form must be upper case and stand alone", () => {
  assert.deepEqual(clientFormsIn("ep"), []);
  assert.ok(clientFormsIn("EP").length > 0);
  assert.deepEqual(clientFormsIn("REPORT"), []);
});

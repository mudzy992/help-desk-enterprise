/*
  Tests for the E2E password rotation helper. They pin the properties the server
  actually enforces (`backend/src/modules/authentication/security/password-policy.ts`)
  from the generator's side: length, one character of every class, no characters a
  human confuses, and none of the avoided words in the compacted form the policy
  compares — the product words, the parts of the account's own e-mail and the
  label of its domain.

  Run: node --test scripts/rotate-e2e-actor-passwords.test.mjs
*/

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  actorSecretNames,
  avoidWordsForEmail,
  compactForComparison,
  generateActorPassword,
  genericAvoidWords,
  generatedPasswordLength,
  resolveRepoSlug,
} from './rotate-e2e-actor-passwords.mjs';

const samples = 300;

describe('avoidWordsForEmail', () => {
  it('takes the parts of the local part the policy refuses (4+ characters)', () => {
    assert.deepEqual(avoidWordsForEmail('e2e.user@example.com').slice(0, 1), ['helpdesk']);
    const words = avoidWordsForEmail('e2e.user@example.com');
    assert.ok(words.includes('user'), 'the e-mail local part must be avoided');
    assert.ok(!words.includes('e2e'), 'parts shorter than four characters are not refused by the policy');
  });

  it('takes the domain label and never duplicates a word', () => {
    const words = avoidWordsForEmail('agent@example.com');
    assert.ok(words.includes('agent'));
    assert.ok(words.includes('example'), 'example.com is an internal domain of the test stack');
    assert.equal(new Set(words).size, words.length);
  });

  it('works with a local part that has several separators', () => {
    const words = avoidWordsForEmail('e2e.support-desk_lead@corp.example.org');
    assert.ok(words.includes('support'));
    assert.ok(words.includes('desk'));
    assert.ok(words.includes('lead'));
    assert.ok(words.includes('corp'));
    for (const word of genericAvoidWords) assert.ok(words.includes(word));
  });
});

describe('generateActorPassword', () => {
  const generated = Array.from({ length: samples }, () =>
    generateActorPassword(avoidWordsForEmail('e2e.user@example.com')),
  );

  it('is 24 characters with one character of every class', () => {
    for (const value of generated) {
      assert.equal(value.length, generatedPasswordLength);
      assert.match(value, /[A-Z]/);
      assert.match(value, /[a-z]/);
      assert.match(value, /[0-9]/);
      assert.match(value, /[^A-Za-z0-9]/);
    }
  });

  it('never uses a character an operator can confuse', () => {
    for (const value of generated) assert.doesNotMatch(value, /[IOl10]/);
  });

  it('never contains an avoided word in the compacted form the policy compares', () => {
    const words = avoidWordsForEmail('e2e.user@example.com');
    for (const value of generated) {
      const compact = compactForComparison(value);
      for (const word of words) assert.ok(!compact.includes(word), `${word} in ${value}`);
    }
  });

  it('does not repeat itself', () => {
    assert.equal(new Set(generated).size, samples);
  });

  it('refuses to loop forever when every word is banned', () => {
    // Every alphanumeric character: no candidate can be free of all of them, so
    // the loop must give up instead of spinning. Cutting the work by a single
    // banned letter would leave ~2.5 % of candidates passing per attempt, which
    // is not a test — it is a coin flip.
    const everyCharacter = [...'abcdefghijklmnopqrstuvwxyz0123456789'];
    assert.throws(() => generateActorPassword(everyCharacter), /could not generate/);
  });

  it('covers every actor the harness provisions', () => {
    for (const [actor, entry] of Object.entries(actorSecretNames)) {
      const value = generateActorPassword(avoidWordsForEmail(entry.defaultEmail));
      assert.equal(value.length, generatedPasswordLength, actor);
      assert.match(entry.secret, /^E2E_[A-Z_]+_PASSWORD$/);
    }
  });
});

describe('resolveRepoSlug', () => {
  it('reads both remote shapes', () => {
    assert.equal(resolveRepoSlug('git@github.com:owner/name.git'), 'owner/name');
    assert.equal(resolveRepoSlug('https://github.com/owner/name.git'), 'owner/name');
    assert.equal(resolveRepoSlug('https://github.com/owner/name'), 'owner/name');
    assert.equal(resolveRepoSlug('ssh://git@github.com/owner/name.git'), 'owner/name');
  });
});

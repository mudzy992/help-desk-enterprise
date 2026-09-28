import { randomBytes } from 'node:crypto';

/**
 * Paket 2.6 (§6.2, odluka §16): the pseudonym is random — it is not derived
 * from the user id or any identifier, so nothing links it back to the person.
 */
export type Pseudonym = {
  /** 4 hex characters (6 after collisions), e.g. 7F3A. */
  readonly tag: string;
  /** Shown instead of the name (installation language; the UI may translate by `anonymizedAt`). */
  readonly displayName: string;
  /** Unique, undeliverable (RFC 2606 `.invalid`). */
  readonly email: string;
};

export const anonymizedEmailDomain = 'anonymized.invalid';

export function createPseudonym(attempt = 0, random: (size: number) => Buffer = randomBytes): Pseudonym {
  const tag = random(attempt < 3 ? 2 : 3).toString('hex').toUpperCase();
  return {
    tag,
    displayName: `Bivši korisnik #${tag}`,
    email: `anon-${random(6).toString('hex')}@${anonymizedEmailDomain}`,
  };
}

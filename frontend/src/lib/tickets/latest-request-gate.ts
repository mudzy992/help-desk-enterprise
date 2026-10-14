export type LatestRequestGate = {
  /** Počinje upit i vraća njegov redni broj. */
  begin(): number;
  /** Provjerava da li token i dalje pripada najnovijem upitu. */
  isLatest(token: number): boolean;
};

/**
 * Promjena filtera, stranice ili tihi realtime refresh mogu pokrenuti više
 * upita, a odgovori ne stižu nužno istim redom. Bez ove provjere sporiji
 * odgovor za stari filter može završiti posljednji i prikazati pogrešne redove.
 *
 * Čuvar pamti samo redni broj posljednjeg upita. Stariji odgovor se odbacuje
 * umjesto da mijenja trenutno prikazanu listu.
 */
export function createLatestRequestGate(): LatestRequestGate {
  let latestToken = 0;
  return {
    begin() {
      latestToken += 1;
      return latestToken;
    },
    isLatest(token) {
      return token === latestToken;
    },
  };
}

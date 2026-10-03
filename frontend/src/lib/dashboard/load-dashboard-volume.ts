import { ticketListMaxPageSize } from "@/lib/tickets/ticket-constants";

/**
 * Koliko tiketa jedna stranica grafikona smije tražiti.
 *
 * Mora ostati unutar onoga što API dozvoljava: `GET /tickets` odbija
 * `pageSize` veći od `ticketListPaging.maxPageSize` (50) sa
 * `VALIDATION: pageSize must not be greater than 50`
 * (`backend/src/modules/tickets/dto/list-tickets-query.dto.ts`, `@Max`).
 */
export const dashboardVolumePageSize = ticketListMaxPageSize;

/**
 * Koliko se stranica najviše dohvati za grafik. Šest stranica × 50 = 300
 * tiketa u periodu; iznad toga serija je donja granica i UI to kaže.
 */
export const dashboardVolumeMaxPages = 6;

export type DashboardVolumePage<TTicket> = {
  readonly items: readonly TTicket[];
};

export type DashboardVolumeLoad<TTicket> = {
  readonly tickets: readonly TTicket[];
  /** `true` kad je dostignut maksimum stranica, a zadnja je bila puna. */
  readonly truncated: boolean;
};

/**
 * Dohvata sve stranice grafikona redom (najnoviji prvi) i staje na prvom
 * nepotpunom listu. Redoslijed je bitan: stranica se traži samo ako prethodna
 * nije dokazala da je podataka manje, pa tipičan dan ostaje jedan zahtjev.
 */
export async function loadDashboardVolume<TTicket>(input: {
  readonly fetchPage: (
    page: number,
    pageSize: number,
  ) => Promise<DashboardVolumePage<TTicket>>;
  readonly pageSize?: number;
  readonly maxPages?: number;
}): Promise<DashboardVolumeLoad<TTicket>> {
  // Zaštita od regresije: nikad iznad onoga što API prihvata.
  const pageSize = Math.min(
    Math.max(input.pageSize ?? dashboardVolumePageSize, 1),
    ticketListMaxPageSize,
  );
  const maxPages = Math.max(input.maxPages ?? dashboardVolumeMaxPages, 1);
  const tickets: TTicket[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await input.fetchPage(page, pageSize);
    tickets.push(...response.items);
    if (response.items.length < pageSize) {
      return { tickets, truncated: false };
    }
  }
  return { tickets, truncated: true };
}

import { describe, expect, it, vi } from "vitest";
import {
  dashboardVolumeMaxPages,
  dashboardVolumePageSize,
  loadDashboardVolume,
} from "@/lib/dashboard/load-dashboard-volume";
import { ticketListMaxPageSize } from "@/lib/tickets/ticket-constants";

/**
 * Regresija sa staginga (2026-10-03): prva verzija vala 1 tražila je
 * `pageSize=100`, a `GET /tickets` odbija sve iznad 50
 * (`VALIDATION: pageSize must not be greater than 50`), pa je grafik na
 * nadzornoj ploči bio prazan uz grešku u konzoli.
 */
describe("loadDashboardVolume (val 1, M15/B6)", () => {
  it("nikad ne traži više od onoga što API prihvata", () => {
    expect(dashboardVolumePageSize).toBe(ticketListMaxPageSize);
    expect(dashboardVolumePageSize).toBeLessThanOrEqual(50);
  });

  it("staje na prvom nepotpunom listu i ne traži dalje stranice", async () => {
    const fetchPage = vi.fn(async () => ({ items: [1, 2, 3] }));
    const load = await loadDashboardVolume({ fetchPage, pageSize: 50 });

    expect(load.tickets).toEqual([1, 2, 3]);
    expect(load.truncated).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(1, 50);
  });

  it("spaja pune stranice dok ne dođe do kraja", async () => {
    const pages: Record<number, number[]> = {
      1: Array.from({ length: 50 }, (_, index) => index),
      2: [50, 51],
    };
    const fetchPage = vi.fn(async (page: number) => ({ items: pages[page] ?? [] }));
    const load = await loadDashboardVolume({ fetchPage, pageSize: 50 });

    expect(load.tickets).toHaveLength(52);
    expect(load.truncated).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("puna zadnja dozvoljena stranica znači donju granicu", async () => {
    const fetchPage = vi.fn(async () => ({
      items: Array.from({ length: 50 }, (_, index) => index),
    }));
    const load = await loadDashboardVolume({ fetchPage, pageSize: 50, maxPages: 2 });

    expect(load.tickets).toHaveLength(100);
    expect(load.truncated).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("prazna prva stranica daje praznu seriju bez oznake odsječenosti", async () => {
    const fetchPage = vi.fn(async () => ({ items: [] }));
    const load = await loadDashboardVolume({ fetchPage, pageSize: 50 });

    expect(load.tickets).toEqual([]);
    expect(load.truncated).toBe(false);
    expect(dashboardVolumeMaxPages).toBe(6);
  });

  it("traženi pageSize iznad granice se svodi na granicu umjesto da padne na serveru", async () => {
    const fetchPage = vi.fn(async () => ({ items: [] }));
    await loadDashboardVolume({ fetchPage, pageSize: 500 });

    expect(fetchPage).toHaveBeenCalledWith(1, ticketListMaxPageSize);
  });
});

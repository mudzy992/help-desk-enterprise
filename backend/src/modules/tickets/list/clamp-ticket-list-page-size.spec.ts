import { clampTicketListPageSize } from './clamp-ticket-list-page-size';
import { ticketListPaging } from './list-tickets.constants';

describe('clampTicketListPageSize', () => {
  it('defaults to the list page size', () => {
    expect(clampTicketListPageSize(undefined)).toBe(
      ticketListPaging.defaultPageSize,
    );
    expect(clampTicketListPageSize(undefined)).toBe(25);
  });

  it('keeps a requested size inside the allowed range', () => {
    expect(clampTicketListPageSize(10)).toBe(10);
    expect(clampTicketListPageSize(50)).toBe(50);
  });

  it('clamps instead of rejecting, so old clients still get a page', () => {
    expect(clampTicketListPageSize(500)).toBe(ticketListPaging.maxPageSize);
    expect(clampTicketListPageSize(51)).toBe(50);
    expect(clampTicketListPageSize(0)).toBe(1);
    expect(clampTicketListPageSize(-3)).toBe(1);
  });
});

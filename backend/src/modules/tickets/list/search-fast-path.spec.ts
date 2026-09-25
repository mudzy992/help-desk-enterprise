import { exactTicketNumberFromNeedle } from './build-ticket-list-filters';

describe('search fast path (k6 C)', () => {
  it('turns a full ticket number into an exact lookup', () => {
    expect(exactTicketNumberFromNeedle('T-000123')).toBe('T-000123');
    expect(exactTicketNumberFromNeedle('t-0001234')).toBe('T-0001234');
  });
  it('keeps partial numbers and free text on the ILIKE path', () => {
    expect(exactTicketNumberFromNeedle('T-12')).toBeNull();
    expect(exactTicketNumberFromNeedle('000123')).toBeNull();
    expect(exactTicketNumberFromNeedle('T-00012a')).toBeNull();
    expect(exactTicketNumberFromNeedle('printer')).toBeNull();
  });
});

import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ticketSlaBreachScanIntervalMs } from './sla.constants';
import { TicketSlaTimersService } from './ticket-sla-timers.service';

@Injectable()
export class TicketSlaBreachScannerService {
  constructor(private readonly timers: TicketSlaTimersService) {}

  @Interval(ticketSlaBreachScanIntervalMs)
  async handleInterval(): Promise<void> {
    await this.timers.scanDue();
  }
}

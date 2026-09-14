import { Injectable } from '@nestjs/common';
import {
  defaultRequestLogRetentionDays,
  recentRequestLogMaxEntries,
} from './request-context.constants';
import type { RecentRequestLogEntry } from './recent-request-log.types';

@Injectable()
export class RecentRequestLogBuffer {
  private entries: RecentRequestLogEntry[] = [];
  private retentionDays = defaultRequestLogRetentionDays;

  append(entry: RecentRequestLogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > recentRequestLogMaxEntries) {
      this.entries.shift();
    }
  }

  setRetentionDays(retentionDays: number): void {
    this.retentionDays = retentionDays;
    this.prune(retentionDays);
  }

  listSince(since: Date): readonly RecentRequestLogEntry[] {
    this.prune(this.retentionDays);
    const cutoff = since.getTime();
    const start = this.entries.findIndex(
      (entry) => Date.parse(entry.timestamp) >= cutoff,
    );
    return start === -1 ? [] : this.entries.slice(start);
  }

  prune(retentionDays: number): void {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const start = this.entries.findIndex(
      (entry) => Date.parse(entry.timestamp) >= cutoff,
    );
    this.entries = start === -1 ? [] : this.entries.slice(start);
  }
}

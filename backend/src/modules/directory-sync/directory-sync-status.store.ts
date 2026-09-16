import { Injectable } from '@nestjs/common';

@Injectable()
export class DirectorySyncStatusStore {
  private lastSuccessfulReadAtMilliseconds: number | null = null;

  markSuccessfulRead(nowMilliseconds: number): void {
    this.lastSuccessfulReadAtMilliseconds = nowMilliseconds;
  }

  getLastSuccessfulReadAt(): string | null {
    if (this.lastSuccessfulReadAtMilliseconds === null) {
      return null;
    }
    return new Date(this.lastSuccessfulReadAtMilliseconds).toISOString();
  }
}

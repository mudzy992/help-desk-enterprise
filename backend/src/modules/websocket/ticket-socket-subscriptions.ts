import type { Socket } from 'socket.io';

export type TicketSocketVisibility = 'public' | 'staff';

export type TicketSocketSubscription = {
  readonly client: Socket;
  readonly ticketId: string;
  readonly visibility: TicketSocketVisibility;
  readonly epoch: number;
};

/**
 * Per-process registry for ticket rooms owned by local Socket.IO connections.
 * The ticket epoch advances whenever a ticket update or safety sweep invalidates
 * an active subscription; a room is current only after authorization succeeds
 * against that epoch. Pending joins are included so an update racing a join
 * cannot publish before the join has been checked against the new epoch.
 */
export class TicketSocketSubscriptionRegistry {
  private readonly subscriptionsBySocket = new Map<
    Socket,
    Map<string, TicketSocketSubscription>
  >();
  private readonly socketsByTicket = new Map<string, Set<Socket>>();
  private readonly pendingJoinsByTicket = new Map<string, Set<Socket>>();
  private readonly epochsByTicket = new Map<string, number>();

  currentEpoch(ticketId: string): number {
    return this.epochsByTicket.get(ticketId) ?? 0;
  }

  beginJoin(client: Socket, ticketId: string): void {
    const joining = this.pendingJoinsByTicket.get(ticketId) ?? new Set<Socket>();
    joining.add(client);
    this.pendingJoinsByTicket.set(ticketId, joining);
  }

  finishJoin(client: Socket, ticketId: string): void {
    const joining = this.pendingJoinsByTicket.get(ticketId);
    joining?.delete(client);
    if (joining?.size === 0) {
      this.pendingJoinsByTicket.delete(ticketId);
    }
    this.pruneEpoch(ticketId);
  }

  /** Returns null when there is no local subscriber or join to invalidate. */
  advanceEpoch(ticketId: string): number | null {
    if (!this.hasTicketInterest(ticketId)) {
      return null;
    }
    const next = this.currentEpoch(ticketId) + 1;
    this.epochsByTicket.set(ticketId, next);
    return next;
  }

  register(
    client: Socket,
    ticketId: string,
    visibility: TicketSocketVisibility,
    epoch: number,
  ): boolean {
    if (this.currentEpoch(ticketId) !== epoch) {
      return false;
    }
    const byTicket =
      this.subscriptionsBySocket.get(client) ??
      new Map<string, TicketSocketSubscription>();
    byTicket.set(ticketId, { client, ticketId, visibility, epoch });
    this.subscriptionsBySocket.set(client, byTicket);
    const sockets = this.socketsByTicket.get(ticketId) ?? new Set<Socket>();
    sockets.add(client);
    this.socketsByTicket.set(ticketId, sockets);
    return true;
  }

  subscriptionFor(
    client: Socket,
    ticketId: string,
  ): TicketSocketSubscription | undefined {
    return this.subscriptionsBySocket.get(client)?.get(ticketId);
  }

  hasCurrentSubscription(client: Socket, ticketId: string): boolean {
    const subscription = this.subscriptionFor(client, ticketId);
    return subscription !== undefined && subscription.epoch === this.currentEpoch(ticketId);
  }

  hasInterest(client: Socket, ticketId: string): boolean {
    return (
      this.subscriptionsBySocket.get(client)?.has(ticketId) === true ||
      this.pendingJoinsByTicket.get(ticketId)?.has(client) === true
    );
  }

  socketsForTicket(ticketId: string): readonly Socket[] {
    const sockets = new Set(this.socketsByTicket.get(ticketId) ?? []);
    for (const client of this.pendingJoinsByTicket.get(ticketId) ?? []) {
      sockets.add(client);
    }
    return [...sockets];
  }

  activeTicketIds(): readonly string[] {
    return [
      ...new Set([
        ...this.socketsByTicket.keys(),
        ...this.pendingJoinsByTicket.keys(),
      ]),
    ];
  }

  activeSubscriptions(): readonly TicketSocketSubscription[] {
    return [...this.subscriptionsBySocket.values()].flatMap((byTicket) =>
      [...byTicket.values()],
    );
  }

  remove(client: Socket, ticketId: string): void {
    const byTicket = this.subscriptionsBySocket.get(client);
    byTicket?.delete(ticketId);
    if (byTicket?.size === 0) {
      this.subscriptionsBySocket.delete(client);
    }
    const sockets = this.socketsByTicket.get(ticketId);
    sockets?.delete(client);
    if (sockets?.size === 0) {
      this.socketsByTicket.delete(ticketId);
    }
    this.pruneEpoch(ticketId);
  }

  removeSocket(client: Socket): void {
    const byTicket = this.subscriptionsBySocket.get(client);
    if (byTicket !== undefined) {
      for (const ticketId of [...byTicket.keys()]) {
        this.remove(client, ticketId);
      }
    }
    for (const [ticketId, joining] of this.pendingJoinsByTicket) {
      joining.delete(client);
      if (joining.size === 0) {
        this.pendingJoinsByTicket.delete(ticketId);
      }
      this.pruneEpoch(ticketId);
    }
  }

  clear(): void {
    this.subscriptionsBySocket.clear();
    this.socketsByTicket.clear();
    this.pendingJoinsByTicket.clear();
    this.epochsByTicket.clear();
  }

  private hasTicketInterest(ticketId: string): boolean {
    return (
      (this.socketsByTicket.get(ticketId)?.size ?? 0) > 0 ||
      (this.pendingJoinsByTicket.get(ticketId)?.size ?? 0) > 0
    );
  }

  private pruneEpoch(ticketId: string): void {
    if (!this.hasTicketInterest(ticketId)) {
      this.epochsByTicket.delete(ticketId);
    }
  }
}

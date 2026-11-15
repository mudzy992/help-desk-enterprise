import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io, type Socket as ClientSocket } from "socket.io-client";
import { broadcastEdgeEventRealtime } from "./broadcast-edge-realtime";

describe("personal Edge notifications in shared ticket rooms", () => {
  it("delivers each recipient only their own row, even while both view the same ticket", async () => {
    const http = createServer();
    const server = new Server(http, { transports: ["websocket"] });
    const clients: ClientSocket[] = [];
    try {
      server.on("connection", (socket) => {
        const user = String(socket.handshake.auth.user);
        void Promise.all([
          socket.join(`user:${user}`),
          socket.join("ticket:ticket-1"),
        ]).then(() => socket.emit("ready"));
      });
      await new Promise<void>((resolve) =>
        http.listen(0, "127.0.0.1", resolve),
      );
      const address = http.address() as AddressInfo;
      const connect = async (user: string): Promise<ClientSocket> => {
        const client = io(`http://127.0.0.1:${address.port}`, {
          autoConnect: false,
          reconnection: false,
          transports: ["websocket"],
          auth: { user },
        });
        clients.push(client);
        const ready = new Promise<void>((resolve) =>
          client.once("ready", resolve),
        );
        client.connect();
        await ready;
        return client;
      };
      const first = await connect("user-a");
      const second = await connect("user-b");
      const seenA: string[] = [];
      const seenB: string[] = [];
      first.on("notification.created", (data: { id: string }) =>
        seenA.push(data.id),
      );
      second.on("notification.created", (data: { id: string }) =>
        seenB.push(data.id),
      );
      const firstBarrier = new Promise<void>((resolve) =>
        first.once("test:barrier", resolve),
      );
      const secondBarrier = new Promise<void>((resolve) =>
        second.once("test:barrier", resolve),
      );
      for (const user of ["user-a", "user-b"]) {
        broadcastEdgeEventRealtime(server, {
          userId: user,
          ticketId: "ticket-1",
          eventName: "notification.created",
          data: { id: user },
        });
      }
      server.to("ticket:ticket-1").emit("test:barrier");
      await Promise.all([firstBarrier, secondBarrier]);
      expect(seenA).toEqual(["user-a"]);
      expect(seenB).toEqual(["user-b"]);
    } finally {
      clients.forEach((client) => client.disconnect());
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 10_000);
});

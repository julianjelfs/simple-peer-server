import { serve } from "https://deno.land/std@0.87.0/http/server.ts";
import {
  acceptWebSocket,
  WebSocket,
  isWebSocketCloseEvent,
} from "https://deno.land/std@0.87.0/ws/mod.ts";

const PORT = Deno.env.get("PORT") || 3000;

const sockets: Record<string, WebSocket> = {};

type ConnectedPeers = {
  kind: "connected-peers";
  peers: string[];
};
type LostConnectionMessage = {
  kind: "lost-connection";
  to: string;
};
type SignalMessage = {
  src: string;
  dst: string;
  kind: "signal";
  payload: unknown;
};
type Message = SignalMessage | LostConnectionMessage | ConnectedPeers;

function broadcastPeers() {
  const peers = Object.keys(sockets);
  Object.values(sockets).forEach((socket) => {
    if (!socket.isClosed)
      socket.send(
        JSON.stringify({
          kind: "connected-peers",
          peers: [...peers],
        })
      );
  });
}

function broadcastMessage(message: string, peerName: string) {
  Object.entries(sockets).forEach(([id, socket]) => {
    if (!socket.isClosed && peerName !== id) socket.send(message);
  });
}

async function handleWs(peerName: string, sock: WebSocket) {
  console.log("socket connection from ", peerName);
  sockets[peerName] = sock;
  broadcastPeers();

  for await (const ev of sock) {
    if (isWebSocketCloseEvent(ev)) {
      delete sockets[peerName];
      broadcastPeers();
      broadcastMessage(
        JSON.stringify({
          kind: "lost-connection",
          to: peerName,
        }),
        peerName
      );
      return;
    }

    if (typeof ev === "string") {
      const msg = JSON.parse(ev) as Message;
      if (msg.kind === "signal") {
        console.log("signal message received: ", msg);
        const target = sockets[msg.dst];
        if (target !== undefined) {
          target.send(ev);
        } else {
          console.log(
            "the target of the signal message is not connected to the server"
          );
        }
      }
    }
  }
}

for await (const req of serve({ port: Number(PORT) })) {
  const { conn, r: bufReader, w: bufWriter, headers, url } = req;
  const matches = url.match(/id=(.+)/);
  let peerName = "";
  if (matches) {
    peerName = matches[1];
  }

  acceptWebSocket({
    conn,
    bufReader,
    bufWriter,
    headers,
  }).then((socket: WebSocket) => handleWs(peerName, socket));
  // .catch(console.error)
}

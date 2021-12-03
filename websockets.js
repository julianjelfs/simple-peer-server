const WebSocket = require("ws");
const queryString = require("query-string");

const sockets = {};

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

function broadcastMessage(message, peerName) {
  Object.entries(sockets).forEach(([id, socket]) => {
    if (!socket.isClosed && peerName !== id) socket.send(message);
  });
}

function init(expressServer) {
  const server = new WebSocket.Server({
    noServer: true,
    path: "/",
  });

  expressServer.on("upgrade", (request, socket, head) => {
    server.handleUpgrade(request, socket, head, (websocket) => {
      server.emit("connection", websocket, request);
    });
  });

  server.on("connection", (connection, connectionRequest) => {
    const [_path, params] = connectionRequest?.url?.split("?");
    const connectionParams = queryString.parse(params);
    const peerName = connectionParams.id;
    console.log("Peer connected: ", connectionParams.id);
    sockets[peerName] = connection;
    broadcastPeers();

    connection.on("message", (message) => {
      const msg = JSON.parse(message);
      if (msg.kind === "signal") {
        console.log(
          "signal message received: from: ",
          msg.src,
          ", to: ",
          msg.dst
        );
        const target = sockets[msg.dst];
        if (target !== undefined) {
          target.send(JSON.stringify(msg));
        } else {
          console.log(
            "the target of the signal message is not connected to the server",
            Object.keys(sockets)
          );
        }
      }
    });

    connection.on("close", () => {
      console.log("Peer disconnected: ", peerName);
      delete sockets[peerName];
      broadcastPeers();
      broadcastMessage(
        JSON.stringify({
          kind: "lost-connection",
          to: peerName,
        }),
        peerName
      );
    });
  });

  return server;
}

exports.init = init;

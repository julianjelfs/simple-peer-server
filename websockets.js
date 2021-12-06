const WebSocket = require("ws");
const queryString = require("query-string");

const sockets = {};
const queuedMessages = {};

function broadcastMessage(message, peerName) {
  Object.entries(sockets).forEach(([id, socket]) => {
    if (!socket.isClosed && peerName !== id) socket.send(message);
  });
}

function enqueMessage(remotePeer, message) {
  if (queuedMessages[remotePeer] === undefined) {
    queuedMessages[remotePeer] = [];
  }
  queuedMessages[remotePeer].push(message);
}

function flushQueuedMessages(peer, socket) {
  if (queuedMessages[peer]) {
    queuedMessages[peer].forEach((msg) => {
      console.log("flushing a message for peer: ", peer);
      socket.send(JSON.stringify(msg));
    });
    delete queuedMessages[peer];
  }
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
    flushQueuedMessages(peerName, connection);

    connection.on("message", (message) => {
      const msg = JSON.parse(message);
      if (msg.kind === "signal") {
        console.log(
          "signal message received: from: ",
          msg.content.sender,
          ", to: ",
          msg.content.receiver
        );
        const target = sockets[msg.content.receiver];
        if (target !== undefined) {
          target.send(JSON.stringify(msg));
        } else {
          enqueMessage(msg.content.receiver, msg);
          console.log(
            msg.content.receiver,
            " is not connected to the server, enqueueing message",
            Object.keys(sockets)
          );
        }
      } else if (msg.type !== "ping") {
        console.log("didn't recognise message: ", message);
      }
    });

    connection.on("close", () => {
      console.log("Peer disconnected: ", peerName);
      delete sockets[peerName];
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

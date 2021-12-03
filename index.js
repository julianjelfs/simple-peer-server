const express = require("express");
const websockets = require("./websockets");

const app = express();
const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  if (process.send) {
    process.send(`Server running at http://localhost:${port}\n\n`);
  }
  console.log(`Server running at http://localhost:${port}\n\n`);
});

websockets.init(server);

process.on("message", (message) => {
  console.log(message);
});

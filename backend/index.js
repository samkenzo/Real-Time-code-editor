const express = require("express");
const app = express();
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const ACTIONS = require("./Actions");
const cors = require("cors");
const server = http.createServer(app);
const io = new Server(server);
const fs = require("fs");
const { exec } = require("child_process");
const bodyParser = require("body-parser");
const { json } = require("express");

app.use(bodyParser.json());

app.use(
  cors({
    origin: "*",
  })
);

app.post("/execute", (req, res) => {
  console.log("Received POST request to /execute");

  console.log("Request body:", req.body);

  if (!req.body) {
    return res.status(400).json({ error: "Request body is required" });
  }
  const { code } = req.body;

  console.log("Received code:", code); // Log the received code

  if (!code) {
    return res.status(400).json({ error: "Code is required" });
  }

  const filename = "temp.py";
  fs.writeFileSync(filename, code);

  const command = `python ${filename}`;

  exec(command, (error, stdout, stderr) => {
    fs.unlinkSync(filename); // Clean up temporary file

    if (error) {
      console.error(`Execution error: ${error}`);
      return res.status(500).json({ error: stderr });
    }

    console.log(`Execution result: ${stdout}`);
    res.status(200).json({ output: stdout });
  });
});

app.get("/", (req, res) => {
  res.send("Hello");
});

const userSocketMap = {};
function getAllConnectedClients(roomId) {
  // Map
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
    (socketId) => {
      return {
        socketId,
        username: userSocketMap[socketId],
      };
    }
  );
}

io.on("connection", (socket) => {
  console.log("socket connected", socket.id);

  socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
    userSocketMap[socket.id] = username;
    socket.join(roomId);
    const clients = getAllConnectedClients(roomId);
    clients.forEach(({ socketId }) => {
      io.to(socketId).emit(ACTIONS.JOINED, {
        clients,
        username,
        socketId: socket.id,
      });
    });
  });

  socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
    socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
    io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  socket.on("disconnecting", () => {
    const rooms = [...socket.rooms];
    rooms.forEach((roomId) => {
      socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id,
        username: userSocketMap[socket.id],
      });
    });
    delete userSocketMap[socket.id];
    socket.leave();
  });
});

const PORT = 8000; //process.env.PORT ||
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));

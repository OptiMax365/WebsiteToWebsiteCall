const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

/* DATABASE */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

/* ensure table exists */
pool.query(`
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY
);
`);

/* memory state */
const peers = new Map();      // username -> peerId
const sessions = new Map();   // username -> ws

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastUsers() {
  const users = Array.from(peers.entries()).map(([username, peerId]) => ({
    username,
    peerId
  }));

  wss.clients.forEach(client => {
    send(client, { type: "user-list", users });
  });
}

/* WS CONNECTION */
wss.on("connection", (ws) => {
  let currentUser = null;

  ws.on("message", async (msg) => {
    let d;

    try {
      d = JSON.parse(msg);
    } catch {
      return;
    }

    /* SIGNUP */
    if (d.type === "signup") {
      const u = (d.username || "").toLowerCase().trim();
      if (!u) return;

      const exists = await pool.query(
        "SELECT 1 FROM users WHERE username=$1",
        [u]
      );

      if (exists.rows.length) {
        return send(ws, {
          type: "signup-fail",
          message: "User already exists"
        });
      }

      await pool.query(
        "INSERT INTO users(username) VALUES($1)",
        [u]
      );

      return send(ws, {
        type: "signup-ok"
      });
    }

    /* LOGIN (STRICT CHECK AGAINST POSTGRES) */
    if (d.type === "login") {
      const u = (d.username || "").toLowerCase().trim();
      if (!u) return;

      const res = await pool.query(
        "SELECT 1 FROM users WHERE username=$1",
        [u]
      );

      if (!res.rows.length) {
        return send(ws, { type: "login-fail" });
      }

      currentUser = u;
      sessions.set(u, ws);

      return send(ws, {
        type: "login-ok",
        username: u
      });
    }

    /* BLOCK EVERYTHING IF NOT LOGGED IN */
    if (!currentUser) return;

    /* REGISTER PEER (ONLY AFTER LOGIN) */
    if (d.type === "register-peer") {
      peers.set(currentUser, d.peerId);
      broadcastUsers();
    }
  });

  ws.on("close", () => {
    if (currentUser) {
      sessions.delete(currentUser);
      peers.delete(currentUser);
      broadcastUsers();
    }
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
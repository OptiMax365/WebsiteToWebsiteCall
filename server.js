const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

const db = new sqlite3.Database("./users.db");

db.run(`
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY
)
`);

const online = new Map();

/* -------------------- */
/* BROADCAST USERS */
/* -------------------- */

function broadcastUsers() {
  const users = Array.from(online.values());

  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(JSON.stringify({ type: "users", users }));
    }
  });
}

/* -------------------- */
/* CALL SIGNALING SYSTEM */
/* -------------------- */

const sockets = new Map(); // username → ws

function sendTo(user, data) {
  const ws = sockets.get(user);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

wss.on("connection", (ws) => {

  let currentUser = null;

  ws.on("message", (msg) => {

    const data = JSON.parse(msg);

    sockets.set(data.username || currentUser, ws);

    /* -------------------- */
    /* SIGNUP */
/* -------------------- */

    if (data.type === "signup") {

      const username = data.username;

      if (!username || username.length < 10) {
        ws.send(JSON.stringify({
          type: "error",
          message: "Username must be 10+ characters"
        }));
        return;
      }

      db.get(
        "SELECT username FROM users WHERE username=?",
        [username],
        (err, row) => {

          if (row) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Username already exists"
            }));
          } else {
            db.run("INSERT INTO users(username) VALUES(?)", [username]);

            ws.send(JSON.stringify({
              type: "ok",
              message: "Account created"
            }));
          }
        }
      );
    }

    /* -------------------- */
    /* SIGNIN (VERIFIED LOGIN) */
/* -------------------- */

    if (data.type === "signin") {

      const username = data.username;

      db.get(
        "SELECT username FROM users WHERE username=?",
        [username],
        (err, row) => {

          if (!row) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Account not found"
            }));
            return;
          }

          currentUser = username;

          online.set(username, {
            username,
            peerId: data.peerId,
            status: "online"
          });

          broadcastUsers();

          ws.send(JSON.stringify({
            type: "ok",
            message: "Signed in"
          }));
        }
      );
    }

    /* -------------------- */
    /* CALL REQUEST */
/* -------------------- */

    if (data.type === "call-user") {

      sendTo(data.to, {
        type: "incoming-call",
        from: data.from,
        peerId: data.peerId
      });
    }

    /* -------------------- */
    /* CALL ACCEPT */
/* -------------------- */

    if (data.type === "accept-call") {

      sendTo(data.to, {
        type: "call-accepted",
        peerId: data.peerId
      });
    }

    /* -------------------- */
    /* CALL REJECT */
/* -------------------- */

    if (data.type === "reject-call") {

      sendTo(data.to, {
        type: "call-rejected"
      });
    }

  });

  ws.on("close", () => {

    if (currentUser) {
      online.delete(currentUser);
      broadcastUsers();
    }

  });

});

server.listen(process.env.PORT || 3000);

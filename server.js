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

const sockets = new Map(); // username → ws
const online = new Map();  // username → peerId

/* -------------------- */
/* BROADCAST USERS */
/* -------------------- */

function broadcastUsers() {
  const list = Array.from(online.entries()).map(([username, peerId]) => ({
    username,
    peerId
  }));

  const msg = JSON.stringify({ type: "users", users: list });

  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

/* -------------------- */
/* SEND FUNCTION */
/* -------------------- */

function send(user, data) {
  const ws = sockets.get(user);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/* -------------------- */
/* WS CONNECTION */
/* -------------------- */

wss.on("connection", (ws) => {

  let currentUser = null;

  ws.on("message", (msg) => {

    const data = JSON.parse(msg);

    /* -------------------- */
    /* SIGNUP */
/* -------------------- */

    if (data.type === "signup") {

      const username = data.username;

      if (!username || username.length < 10) {
        return ws.send(JSON.stringify({
          type: "error",
          message: "Min 10 characters required"
        }));
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
              message: "Signup success"
            }));
          }
        }
      );
    }

    /* -------------------- */
    /* SIGNIN (STRICT MATCH ONLY) */
/* -------------------- */

    if (data.type === "signin") {

      const username = data.username;

      db.get(
        "SELECT username FROM users WHERE username=?",
        [username],
        (err, row) => {

          if (!row) {
            return ws.send(JSON.stringify({
              type: "error",
              message: "Account not found"
            }));
          }

          currentUser = username;

          sockets.set(username, ws);
          online.set(username, data.peerId);

          broadcastUsers();

          ws.send(JSON.stringify({
            type: "ok",
            message: "Online"
          }));
        }
      );
    }

    /* -------------------- */
    /* CALL REQUEST */
/* -------------------- */

    if (data.type === "call-request") {

      send(data.to, {
        type: "incoming-call",
        from: data.from,
        peerId: data.from
      });
    }

    /* -------------------- */
    /* ACCEPT CALL */
/* -------------------- */

    if (data.type === "accept-call") {

      send(data.to, {
        type: "call-accepted",
        peerId: data.from
      });

      send(data.from, {
        type: "call-start"
      });
    }

    /* -------------------- */
    /* REJECT CALL */
/* -------------------- */

    if (data.type === "reject-call") {

      send(data.to, {
        type: "call-rejected"
      });
    }

    /* -------------------- */
    /* END CALL */
/* -------------------- */

    if (data.type === "end-call") {

      send(data.to, {
        type: "call-ended"
      });
    }

  });

  ws.on("close", () => {

    if (currentUser) {
      sockets.delete(currentUser);
      online.delete(currentUser);
      broadcastUsers();
    }

  });

});

server.listen(process.env.PORT || 3000);

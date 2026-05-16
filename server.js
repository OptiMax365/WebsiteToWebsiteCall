const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* -------------------- */
/* STATIC FRONTEND */
/* -------------------- */

app.use(express.static(path.join(__dirname, "public")));

/* -------------------- */
/* SQLITE DATABASE */
/* -------------------- */

const db = new sqlite3.Database("./users.db");

db.run(`
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY
)
`);

/* -------------------- */
/* ONLINE USERS (LIVE ONLY) */
/* -------------------- */

const online = new Map();

/* -------------------- */
/* BROADCAST USERS */
/* -------------------- */

function broadcastUsers() {
    const users = Array.from(online.values());

    const msg = JSON.stringify({
        type: "users",
        users
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

/* -------------------- */
/* SIGNUP + LOGIN HANDLER */
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
                ws.send(JSON.stringify({
                    type: "error",
                    message: "Username must be at least 10 characters"
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

                        db.run(
                            "INSERT INTO users(username) VALUES(?)",
                            [username]
                        );

                        ws.send(JSON.stringify({
                            type: "ok",
                            message: "Username registered successfully"
                        }));
                    }
                }
            );
        }

        /* -------------------- */
        /* LOGIN */
/* -------------------- */

        if (data.type === "login") {

            currentUser = data.username;

            online.set(currentUser, {
                username: data.username,
                peerId: data.peerId
            });

            broadcastUsers();
        }

    });

    /* -------------------- */
    /* DISCONNECT */
/* -------------------- */

    ws.on("close", () => {

        if (currentUser) {
            online.delete(currentUser);
            broadcastUsers();
        }

    });

});

/* -------------------- */
/* START SERVER */
/* -------------------- */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});

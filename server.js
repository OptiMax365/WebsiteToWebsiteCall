const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query(`
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY
);
`);

const peers = new Map();
const sessions = new Map();

function send(ws, data){
  if(ws.readyState === WebSocket.OPEN){
    ws.send(JSON.stringify(data));
  }
}

function broadcastUsers(){
  const users = Array.from(peers.entries())
    .map(([username, peerId]) => ({ username, peerId }));

  wss.clients.forEach(c=>{
    send(c, { type:"user-list", users });
  });
}

wss.on("connection",(ws)=>{

  let currentUser = null;

  ws.on("message", async(msg)=>{

    const d = JSON.parse(msg);

    /* SIGNUP */
    if(d.type === "signup"){
      const u = d.username.toLowerCase();

      const exists = await pool.query(
        "SELECT * FROM users WHERE username=$1",
        [u]
      );

      if(exists.rows.length){
        return send(ws,{type:"signup-ok"});
      }

      await pool.query(
        "INSERT INTO users(username) VALUES($1)",
        [u]
      );

      return send(ws,{type:"signup-ok"});
    }

    /* LOGIN (STRICT VERIFY) */
    if(d.type === "login"){
      const u = d.username.toLowerCase();

      const res = await pool.query(
        "SELECT * FROM users WHERE username=$1",
        [u]
      );

      if(!res.rows.length){
        return send(ws,{type:"login-fail"});
      }

      currentUser = u;
      sessions.set(u, ws);

      return send(ws,{
        type:"login-ok",
        username:u
      });
    }

    /* MUST BE LOGGED IN */
    if(!currentUser) return;

    /* REGISTER PEER */
    if(d.type === "register-peer"){
      peers.set(currentUser, d.peerId);
      broadcastUsers();
    }

  });

  ws.on("close",()=>{
    if(currentUser){
      sessions.delete(currentUser);
      peers.delete(currentUser);
      broadcastUsers();
    }
  });

});

server.listen(3000);
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

const sockets = new Map();
const peers = new Map();

function normalize(u){
  return (u || "").trim().toLowerCase();
}

function send(user, data){
  const ws = sockets.get(user);
  if(ws && ws.readyState === WebSocket.OPEN){
    ws.send(JSON.stringify(data));
  }
}

function broadcastUsers(){
  const users = Array.from(peers.entries()).map(([username, peerId]) => ({
    username,
    peerId
  }));

  wss.clients.forEach(c=>{
    if(c.readyState === WebSocket.OPEN){
      c.send(JSON.stringify({
        type:"users",
        users
      }));
    }
  });
}

wss.on("connection",(ws)=>{

  let currentUser = null;

  ws.on("message", async(msg)=>{

    const data = JSON.parse(msg);

    /* SIGNUP */
    if(data.type === "signup"){

      const username = normalize(data.username);

      const exists = await pool.query(
        "SELECT username FROM users WHERE username=$1",
        [username]
      );

      if(exists.rows.length){
        return ws.send(JSON.stringify({
          type:"error",
          message:"Username exists"
        }));
      }

      await pool.query(
        "INSERT INTO users(username) VALUES($1)",
        [username]
      );

      return ws.send(JSON.stringify({
        type:"ok",
        message:"Signup successful"
      }));
    }

    /* SIGNIN */
    if(data.type === "signin"){

      const username = normalize(data.username);

      const user = await pool.query(
        "SELECT username FROM users WHERE username=$1",
        [username]
      );

      if(!user.rows.length){
        return ws.send(JSON.stringify({
          type:"error",
          message:"Not registered"
        }));
      }

      currentUser = username;

      sockets.set(username, ws);

      ws.send(JSON.stringify({
        type:"ok",
        message:"authenticated"
      }));

      return;
    }

    /* BLOCK UNAUTH */
    if(!currentUser){
      return ws.send(JSON.stringify({
        type:"error",
        message:"Not authenticated"
      }));
    }

    /* UPDATE PEER */
    if(data.type === "signin" && data.peerId){
      peers.set(currentUser, data.peerId);
      broadcastUsers();
    }

    /* CALL */
    if(data.type === "call-request"){
      send(data.to, {
        type:"incoming-call",
        from:currentUser,
        peerId:peers.get(currentUser)
      });
    }

    /* END CALL */
    if(data.type === "end-call"){
      send(data.to,{type:"call-ended"});
    }

    /* LOGOUT */
    if(data.type === "logout"){
      sockets.delete(currentUser);
      peers.delete(currentUser);
      broadcastUsers();
      currentUser = null;
    }
  });

  ws.on("close",()=>{
    if(currentUser){
      sockets.delete(currentUser);
      peers.delete(currentUser);
      broadcastUsers();
    }
  });
});

server.listen(process.env.PORT || 3000);
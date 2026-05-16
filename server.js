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

function norm(u){ return (u||"").toLowerCase().trim(); }

function send(user,data){
  const ws = sockets.get(user);
  if(ws && ws.readyState===WebSocket.OPEN){
    ws.send(JSON.stringify(data));
  }
}

function broadcast(){
  const users = Array.from(peers.entries())
    .map(([username,peerId])=>({username,peerId}));

  wss.clients.forEach(c=>{
    if(c.readyState===WebSocket.OPEN){
      c.send(JSON.stringify({type:"users",users}));
    }
  });
}

wss.on("connection",(ws)=>{

  let currentUser=null;

  ws.on("message",async(msg)=>{

    const d=JSON.parse(msg);

    if(d.type==="signup"){
      const u=norm(d.username);

      const exists=await pool.query(
        "SELECT * FROM users WHERE username=$1",[u]
      );

      if(exists.rows.length)
        return ws.send(JSON.stringify({type:"error",message:"Exists"}));

      await pool.query(
        "INSERT INTO users(username) VALUES($1)",[u]
      );

      return ws.send(JSON.stringify({type:"ok",message:"Signup OK"}));
    }

    if(d.type==="signin"){
      const u=norm(d.username);

      const user=await pool.query(
        "SELECT * FROM users WHERE username=$1",[u]
      );

      if(!user.rows.length)
        return ws.send(JSON.stringify({type:"error",message:"Not found"}));

      currentUser=u;
      sockets.set(u,ws);

      return ws.send(JSON.stringify({type:"ok",message:"auth"}));
    }

    if(!currentUser) return;

    if(d.type==="call-request"){
      send(d.to,{
        type:"incoming-call",
        from:currentUser,
        peerId:peers.get(currentUser)
      });
    }

    if(d.type==="accept-call"){
      send(d.to,{type:"call-start"});
    }

    if(d.type==="end-call"){
      send(d.to,{type:"call-ended"});
    }

    if(d.type==="peer"){
      peers.set(currentUser,d.peerId);
      broadcast();
    }

  });

  ws.on("close",()=>{
    if(currentUser){
      sockets.delete(currentUser);
      peers.delete(currentUser);
      broadcast();
    }
  });

});

server.listen(3000);
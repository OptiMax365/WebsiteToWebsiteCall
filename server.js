const express=require("express");
const http=require("http");
const WebSocket=require("ws");
const path=require("path");
const {Pool}=require("pg");

const app=express();
const server=http.createServer(app);
const wss=new WebSocket.Server({server});

app.use(express.static(path.join(__dirname,"public")));

const pool=new Pool({
  connectionString:process.env.DATABASE_URL,
  ssl:{rejectUnauthorized:false}
});

pool.query(`CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY);`);

const sockets=new Map();
const peers=new Map();

function send(u,d){
  const ws=sockets.get(u);
  if(ws&&ws.readyState===WebSocket.OPEN){
    ws.send(JSON.stringify(d));
  }
}

function broadcast(){
  const users=Array.from(peers.entries())
    .map(([username,peerId])=>({username,peerId}));

  wss.clients.forEach(c=>{
    if(c.readyState===WebSocket.OPEN){
      c.send(JSON.stringify({type:"users",users}));
    }
  });
}

wss.on("connection",(ws)=>{

  let user=null;

  ws.on("message",async(msg)=>{

    const d=JSON.parse(msg);

    /* SIGNUP */
    if(d.type==="signup"){
      const u=d.username.toLowerCase();

      const e=await pool.query(
        "SELECT * FROM users WHERE username=$1",[u]
      );

      if(e.rows.length)
        return ws.send(JSON.stringify({type:"error",message:"Exists"}));

      await pool.query("INSERT INTO users VALUES($1)",[u]);

      return ws.send(JSON.stringify({type:"ok",message:"signup"}));
    }

    /* LOGIN */
    if(d.type==="signin"){
      const u=d.username.toLowerCase();

      const r=await pool.query(
        "SELECT * FROM users WHERE username=$1",[u]
      );

      if(!r.rows.length)
        return ws.send(JSON.stringify({type:"error",message:"no user"}));

      user=u;
      sockets.set(u,ws);

      return ws.send(JSON.stringify({type:"ok"}));
    }

    if(!user) return;

    /* IMPORTANT: peer binding FIX */
    if(d.type==="peer-ready"){
      peers.set(user,d.peerId);
      broadcast();
    }

    /* CALL */
    if(d.type==="call"){
      const target=d.to;
      const peerId=peers.get(user);

      send(target,{
        type:"incoming-call",
        from:user,
        peerId
      });
    }

    /* ACCEPT */
    if(d.type==="accept"){
      send(d.to,{type:"call-start"});
    }

    /* END */
    if(d.type==="end"){
      send(d.to,{type:"call-ended"});
    }

  });

  ws.on("close",()=>{
    if(user){
      sockets.delete(user);
      peers.delete(user);
      broadcast();
    }
  });

});

server.listen(3000);
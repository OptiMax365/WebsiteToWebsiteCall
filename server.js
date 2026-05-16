const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* -------------------------- */
/* ONLINE USERS (BY USERNAME) */
/* -------------------------- */

const users = new Map();

/*
users = {
  username: {
    username,
    peerId,
    lastSeen
  }
}
*/

/* -------------------------- */
/* FRONTEND */
/* -------------------------- */

app.use(express.static(path.join(__dirname, "public")));

/* -------------------------- */
/* BROADCAST */
/* -------------------------- */

function broadcastUsers(){

  const list = Array.from(users.values());

  const payload = JSON.stringify({
    type: "users",
    users: list
  });

  wss.clients.forEach(client => {
    if(client.readyState === WebSocket.OPEN){
      client.send(payload);
    }
  });

}

/* -------------------------- */
/* SOCKETS */
/* -------------------------- */

wss.on("connection", (ws) => {

  let currentUser = null;

  ws.on("message", (msg) => {

    try{

      const data = JSON.parse(msg);

      /* LOGIN / JOIN */

      if(data.type === "login"){

        currentUser = data.username;

        users.set(currentUser, {
          username: data.username,
          peerId: data.peerId,
          lastSeen: Date.now()
        });

        broadcastUsers();
      }

      /* HEARTBEAT (keep alive) */
      if(data.type === "ping" && currentUser){

        const u = users.get(currentUser);

        if(u){
          u.lastSeen = Date.now();
          users.set(currentUser, u);
        }

      }

    }catch(e){
      console.log(e);
    }

  });

  ws.on("close", ()=>{

    if(currentUser){
      users.delete(currentUser);
      broadcastUsers();
    }

  });

});

/* -------------------------- */
/* CLEAN DEAD USERS */
/* -------------------------- */

setInterval(()=>{

  const now = Date.now();

  for(const [name, user] of users.entries()){

    if(now - user.lastSeen > 10000){
      users.delete(name);
    }

  }

  broadcastUsers();

}, 5000);

/* -------------------------- */
/* START */
/* -------------------------- */

const PORT = process.env.PORT || 3000;

server.listen(PORT, ()=>{

  console.log("Server running on " + PORT);

});

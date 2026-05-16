const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

/* -------------------------- */
/* EXPRESS APP */
/* -------------------------- */

const app = express();

const server = http.createServer(app);

/* -------------------------- */
/* WEBSOCKET SERVER */
/* -------------------------- */

const wss = new WebSocket.Server({
    server
});

/* -------------------------- */
/* STORE ONLINE USERS */
/* -------------------------- */

const users = new Map();

/*
users = {
   id : {
      id,
      name
   }
}
*/

/* -------------------------- */
/* SERVE FRONTEND */
/* -------------------------- */

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

/* -------------------------- */
/* BROADCAST USERS */
/* -------------------------- */

function broadcastUsers(){

    const list =
        Array.from(users.values());

    const payload =
        JSON.stringify({
            type:"users",
            users:list
        });

    wss.clients.forEach(client => {

        if(client.readyState === WebSocket.OPEN){

            client.send(payload);

        }

    });

}

/* -------------------------- */
/* NEW SOCKET CONNECTION */
/* -------------------------- */

wss.on("connection", (ws) => {

    console.log("User connected");

    let currentUserId = null;

    /* ---------------------- */
    /* RECEIVE MESSAGE */
    /* ---------------------- */

    ws.on("message", (msg) => {

        try{

            const data =
                JSON.parse(msg);

            /* ------------------ */
            /* USER JOIN */
            /* ------------------ */

            if(data.type === "join"){

                currentUserId = data.id;

                users.set(currentUserId, {
                    id:data.id,
                    name:data.name
                });

                console.log(
                    data.name +
                    " joined"
                );

                broadcastUsers();

            }

        }catch(err){

            console.log(err);

        }

    });

    /* ---------------------- */
    /* USER DISCONNECT */
    /* ---------------------- */

    ws.on("close", () => {

        console.log("User disconnected");

        if(currentUserId){

            users.delete(currentUserId);

            broadcastUsers();

        }

    });

});

/* -------------------------- */
/* START SERVER */
/* -------------------------- */

const PORT =
    process.env.PORT || 3000;

server.listen(PORT, () => {

    console.log(
        "Server running on port " + PORT
    );

});
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 3000 });

/*
Structure:
users = {
  peerId: { peerId, username, room }
}
*/

const users = new Map();

function broadcastRoom(room) {
    const list = Array.from(users.values())
        .filter(u => u.room === room);

    const payload = JSON.stringify({
        type: "users",
        room,
        users: list
    });

    for (const client of wss.clients) {
        if (client.readyState === 1) {
            client.send(payload);
        }
    }
}

function broadcastAll() {
    const rooms = new Set(Array.from(users.values()).map(u => u.room));

    rooms.forEach(r => broadcastRoom(r));
}

wss.on("connection", (ws) => {

    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        /* JOIN ROOM */
        if (data.type === "join") {

            users.set(data.peerId, {
                peerId: data.peerId,
                username: data.username,
                room: data.room
            });

            broadcastRoom(data.room);
        }

        /* SWITCH ROOM */
        if (data.type === "switch") {

            const user = users.get(data.peerId);
            if (user) {
                user.room = data.room;
                users.set(data.peerId, user);
                broadcastAll();
            }
        }

        /* LEAVE */
        if (data.type === "leave") {
            const user = users.get(data.peerId);
            if (user) {
                users.delete(data.peerId);
                broadcastRoom(user.room);
            }
        }
    });

    ws.on("close", () => {
        // cleanup best-effort
        broadcastAll();
    });
});

console.log("NEON WORLD v2 tracker running on ws://localhost:3000");
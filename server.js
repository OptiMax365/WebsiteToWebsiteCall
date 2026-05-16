import express from "express";
import http from "http";
import { ExpressPeerServer } from "peer";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const server = http.createServer(app);

const activeUsers = {};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(express.json());

app.use(cors());

app.use(express.static(__dirname));



/*
========================================
PEER SERVER
========================================
*/

const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: "/"
});

app.use("/peerjs", peerServer);



peerServer.on("connection", client => {

  const id = client.getId();

  console.log("PEER CONNECTED:", id);

});



peerServer.on("disconnect", client => {

  const id = client.getId();

  console.log("PEER DISCONNECTED:", id);

  for (const username in activeUsers) {

    if (activeUsers[username] === id) {

      delete activeUsers[username];

      console.log(
        "REMOVED ACTIVE USER:",
        username
      );

    }

  }

});



/*
========================================
DATABASE
========================================
*/

async function createTable() {

  try {

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users(
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      )
    `);

    console.log("USERS TABLE READY");

  } catch (err) {

    console.log("DATABASE ERROR:", err);

  }

}

createTable();



/*
========================================
ROUTES
========================================
*/

app.get("/", (req, res) => {

  res.sendFile(
    path.join(__dirname, "index.html")
  );

});



app.get("/health", (req, res) => {

  res.json({
    success: true,
    onlineUsers: Object.keys(activeUsers).length
  });

});



/*
========================================
ACTIVE USERS
========================================
*/

app.post("/active", (req, res) => {

  try {

    const username =
      req.body.username
      ?.trim()
      ?.toLowerCase();

    const peerId =
      req.body.peerId;

    if (!username || !peerId) {

      return res.json({
        success: false
      });

    }

    activeUsers[username] = peerId;

    console.log(
      "ACTIVE USER:",
      username,
      peerId
    );

    res.json({
      success: true
    });

  } catch (err) {

    console.log(err);

    res.json({
      success: false
    });

  }

});



app.get("/active/:username", (req, res) => {

  const username =
    req.params.username
    ?.trim()
    ?.toLowerCase();

  res.json({
    peerId:
      activeUsers[username] || null
  });

});



/*
========================================
SIGNUP
========================================
*/

app.post("/signup", async (req, res) => {

  try {

    const username =
      req.body.username
      ?.trim()
      ?.toLowerCase();

    const password =
      req.body.password;

    if (!username || !password) {

      return res.json({
        success: false,
        message: "Missing fields"
      });

    }

    const existing =
      await pool.query(
        "SELECT * FROM users WHERE username=$1",
        [username]
      );

    if (existing.rows.length > 0) {

      return res.json({
        success: false,
        message: "Username already exists"
      });

    }

    const hash =
      await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users(username,password) VALUES($1,$2)",
      [username, hash]
    );

    console.log("NEW USER:", username);

    res.json({
      success: true
    });

  } catch (err) {

    console.log(err);

    res.json({
      success: false,
      message: "Signup failed"
    });

  }

});



/*
========================================
LOGIN
========================================
*/

app.post("/login", async (req, res) => {

  try {

    const username =
      req.body.username
      ?.trim()
      ?.toLowerCase();

    const password =
      req.body.password;

    if (!username || !password) {

      return res.json({
        success: false,
        message: "Missing login fields"
      });

    }

    const result =
      await pool.query(
        "SELECT * FROM users WHERE username=$1",
        [username]
      );

    if (result.rows.length === 0) {

      return res.json({
        success: false,
        message: "User not found"
      });

    }

    const user =
      result.rows[0];

    const valid =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!valid) {

      return res.json({
        success: false,
        message: "Wrong password"
      });

    }

    console.log("LOGIN:", username);

    res.json({
      success: true,
      username: user.username
    });

  } catch (err) {

    console.log(err);

    res.json({
      success: false,
      message: "Login failed"
    });

  }

});



/*
========================================
START SERVER
========================================
*/

const PORT =
  process.env.PORT || 10000;

server.listen(PORT, () => {

  console.log(
    "SERVER RUNNING ON PORT",
    PORT
  );

});
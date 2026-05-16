import express from "express";
import http from "http";
import { PeerServer } from "peer";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const server = http.createServer(app);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(express.json());

app.use(express.static(__dirname));

const peerServer = PeerServer({
  port: 0,
  path: "/"
});

app.use("/peerjs", peerServer);

async function createTable(){

  try{

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users(
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      )
    `);

    console.log("USERS TABLE READY");

  }catch(err){

    console.log("Database Error:", err);

  }

}

createTable();

app.get("/", (req,res)=>{
  res.sendFile(path.join(__dirname,"index.html"));
});

app.post("/signup", async (req,res)=>{

  try{

    const { username, password } = req.body;

    const existing =
      await pool.query(
        "SELECT * FROM users WHERE username=$1",
        [username]
      );

    if(existing.rows.length > 0){

      return res.json({
        success:false,
        message:"Username already exists"
      });

    }

    const hash =
      await bcrypt.hash(password,10);

    await pool.query(
      "INSERT INTO users(username,password) VALUES($1,$2)",
      [username,hash]
    );

    res.json({
      success:true
    });

  }catch(err){

    console.log(err);

    res.json({
      success:false,
      message:"Signup failed"
    });

  }

});

app.post("/login", async (req,res)=>{

  try{

    const { username, password } = req.body;

    const result =
      await pool.query(
        "SELECT * FROM users WHERE username=$1",
        [username]
      );

    if(result.rows.length === 0){

      return res.json({
        success:false,
        message:"User not found"
      });

    }

    const user = result.rows[0];

    const valid =
      await bcrypt.compare(
        password,
        user.password
      );

    if(!valid){

      return res.json({
        success:false,
        message:"Wrong password"
      });

    }

    res.json({
      success:true,
      username:user.username
    });

  }catch(err){

    console.log(err);

    res.json({
      success:false,
      message:"Login failed"
    });

  }

});

const PORT = process.env.PORT || 10000;

server.listen(PORT,()=>{

  console.log("SERVER RUNNING ON PORT",PORT);

});
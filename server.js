// server.js
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import pkg from "pg";

const { Pool } = pkg;
const app = express();

// ======================
// PORT
// ======================
const PORT = process.env.PORT || 3000;

// ======================
// DATABASE CONNECTION
// ======================
// On Render, DATABASE_URL is already set in environment variables
// Locally, you can use a .env file with DATABASE_URL

let connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ DATABASE_URL is not set! Exiting.");
  process.exit(1);
}

// Create PostgreSQL pool with SSL for Render
const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: true // Required for Render PostgreSQL
  }
});

// ======================
// MIDDLEWARE
// ======================
app.use(cors());
app.use(express.json());

// ======================
// DATABASE INIT
// ======================
async function startDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users(
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database Ready");
  } catch (err) {
    console.error("❌ Database Error:", err);
  }
}

// Start DB
startDatabase();

// ======================
// ROUTES
// ======================

// Root
app.get("/", (req, res) => {
  res.send("VOICE MESH SERVER RUNNING");
});

// SIGNUP
app.post("/signup", async (req, res) => {
  try {
    let { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Missing username or password" });
    }

    username = username.toLowerCase().trim();

    // Check if username exists
    const check = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    if (check.rows.length > 0) {
      return res.status(400).json({ error: "Username already exists" });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Insert user
    await pool.query("INSERT INTO users(username,password) VALUES($1,$2)", [username, hashed]);

    res.json({ success: true, message: "User registered" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Signup server error" });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  try {
    let { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Missing username or password" });
    }

    username = username.toLowerCase().trim();

    // Find user
    const result = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid username" });
    }

    const user = result.rows[0];

    // Compare password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ error: "Invalid password" });
    }

    res.json({ success: true, username: user.username, message: "Login success" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login server error" });
  }
});

// ======================
// START SERVER
// ======================
app.listen(PORT, () => {
  console.log(`✅ SERVER RUNNING ON PORT ${PORT}`);
});
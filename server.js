const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const redis = require("redis");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");

const app = express();

// ============================================================
// SECURITY ADD-ON (TIDAK UBAH LOGIC KAMU)
// ============================================================
app.use(helmet());
app.use(mongoSanitize());

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ============================================================
// RATE LIMIT GLOBAL
// ============================================================
app.use(rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: { error: "Too many requests" }
}));

// ============================================================
// REDIS CACHE
// ============================================================
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379"
});

redisClient.connect()
  .then(() => console.log("⚡ Redis Connected"))
  .catch(err => console.log("❌ Redis Error", err));

// ============================================================
// JWT SECRET
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || "secret_key_ganti_ini";

// ============================================================
// DATABASE
// ============================================================
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log(err));

// ============================================================
// SCHEMA
// ============================================================
const UserSchema = new mongoose.Schema({
  username: String,
  password: String,
});

const IntroSchema = new mongoose.Schema({
  ffId: String,
  namaInGame: String,
  namaReal: String,
  levelAkun: Number,
  usia: Number,
  kota: String,
  tanggal: String,
  waktu: String,
}, { timestamps: true });

const User = mongoose.model("User", UserSchema);
const Intro = mongoose.model("Intro", IntroSchema);

// ============================================================
// AUTH MIDDLEWARE (JWT)
// ============================================================
function auth(req, res, next) {
  const token = req.headers["authorization"];
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token.split(" ")[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ============================================================
// SSE CLIENTS
// ============================================================
let sseClients = [];

function broadcastSSE(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  sseClients = sseClients.filter(c => {
    try {
      c.write(msg);
      return true;
    } catch {
      return false;
    }
  });
}

// ============================================================
// AUTH ROUTES
// ============================================================

// REGISTER
app.post("/auth/register", async (req, res) => {
  const hash = await bcrypt.hash(req.body.password, 10);

  const user = new User({
    username: req.body.username,
    password: hash
  });

  await user.save();
  res.json({ status: "registered" });
});

// LOGIN + JWT
app.post("/auth/login", async (req, res) => {
  const user = await User.findOne({ username: req.body.username });

  if (!user) return res.status(404).json({ error: "User not found" });

  const valid = await bcrypt.compare(req.body.password, user.password);
  if (!valid) return res.status(401).json({ error: "Wrong password" });

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1h" });

  res.json({ token });
});

// ============================================================
// SSE STREAM (ADMIN DASHBOARD REALTIME)
// ============================================================
app.get("/intro/stream", auth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.push(res);

  const ping = setInterval(() => {
    res.write(": ping\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    sseClients = sseClients.filter(c => c !== res);
  });
});

// ============================================================
// CACHE MIDDLEWARE (REDIS)
// ============================================================
async function cache(req, res, next) {
  const key = req.originalUrl;
  const cached = await redisClient.get(key);

  if (cached) return res.json(JSON.parse(cached));

  res.sendResponse = res.json;
  res.json = async (body) => {
    await redisClient.setEx(key, 60, JSON.stringify(body));
    res.sendResponse(body);
  };

  next();
}

// ============================================================
// API INTRO
// ============================================================

// GET ALL
app.get("/intro", auth, cache, async (req, res) => {
  const data = await Intro.find().sort({ _id: -1 });
  res.json(data);
});

// COUNT
app.get("/intro/count", auth, cache, async (req, res) => {
  const count = await Intro.countDocuments();
  res.json({ count });
});

// POST
app.post("/intro", auth, async (req, res) => {
  const data = new Intro(req.body);
  await data.save();

  broadcastSSE("new_intro", data);

  res.json({ status: "ok", data });
});

// DELETE
app.delete("/intro/:id", auth, async (req, res) => {
  await Intro.findByIdAndDelete(req.params.id);

  broadcastSSE("delete_intro", { _id: req.params.id });

  res.json({ status: "deleted" });
});

// ============================================================
// ROOT
// ============================================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ============================================================
// 🔥 HARDENED RAILWAY FIX (TAMBAHAN PENTING)
// ============================================================
process.on("uncaughtException", (err) => {
  console.log("❌ CRASH:", err);
});

process.on("unhandledRejection", (err) => {
  console.log("❌ PROMISE ERROR:", err);
});

// ============================================================
// START SERVER (WAJIB RAILWAY FIX)
// ============================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on", PORT);
});
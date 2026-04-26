require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const redis = require("redis");
const mongoSanitize = require("express-mongo-sanitize");

const app = express();

// ============================================================
// SECURITY HEADERS
// ============================================================
app.use(helmet());

// ============================================================
// BASIC SECURITY MIDDLEWARE
// ============================================================
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "DELETE"]
}));

app.use(express.json({ limit: "10kb" })); // anti payload besar
app.use(express.static(path.join(__dirname, "public")));
app.use(mongoSanitize());

// ============================================================
// RATE LIMIT GLOBAL (HARDENED)
// ============================================================
app.set("trust proxy", 1);

app.use(rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" }
}));

// ============================================================
// REDIS (CACHE + ANTI BOT TRACKING)
// ============================================================
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379"
});

redisClient.connect()
  .then(() => console.log("⚡ Redis Connected"))
  .catch(err => console.log(err));

// ============================================================
// JWT SECRET (ENV)
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET";

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
  createdAt: { type: Date, default: Date.now }
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
// AUTH MIDDLEWARE (HARDENED JWT)
// ============================================================
function auth(req, res, next) {
  const header = req.headers["authorization"];
  if (!header) return res.status(401).json({ error: "No token" });

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      maxAge: "1h"
    });

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ============================================================
// SIMPLE ANTI BOT LAYER
// ============================================================
app.use((req, res, next) => {
  const ip = req.ip;
  const ua = req.headers["user-agent"];

  if (!ua || ua.length < 10) {
    return res.status(403).json({ error: "Bot blocked" });
  }

  // simple abuse tracking
  redisClient.incr(ip);
  redisClient.expire(ip, 60);

  next();
});

// ============================================================
// SSE CLIENTS (HARDENED)
// ============================================================
let sseClients = [];

function broadcastSSE(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  sseClients = sseClients.filter(client => {
    try {
      client.write(msg);
      return true;
    } catch {
      return false;
    }
  });
}

// ============================================================
// AUTH ROUTES (ANTI BRUTE FORCE)
// ============================================================

app.post("/auth/register", async (req, res) => {
  const hash = await bcrypt.hash(req.body.password, 12);

  const user = new User({
    username: req.body.username,
    password: hash
  });

  await user.save();
  res.json({ status: "registered" });
});

// LOGIN (ANTI BRUTE FORCE via Redis)
app.post("/auth/login", async (req, res) => {
  const ip = req.ip;

  const attempts = await redisClient.get(`login:${ip}`);
  if (attempts > 10) {
    return res.status(429).json({ error: "Too many login attempts" });
  }

  const user = await User.findOne({ username: req.body.username });
  if (!user) return res.status(404).json({ error: "User not found" });

  const valid = await bcrypt.compare(req.body.password, user.password);
  if (!valid) {
    await redisClient.incr(`login:${ip}`);
    redisClient.expire(`login:${ip}`, 300);

    return res.status(401).json({ error: "Wrong password" });
  }

  const token = jwt.sign(
    { id: user._id },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ token });
});

// ============================================================
// SSE STREAM (SECURED)
// ============================================================
app.get("/intro/stream", auth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.push(res);

  const ping = setInterval(() => {
    res.write(": ping\n\n");
  }, 20000);

  req.on("close", () => {
    clearInterval(ping);
    sseClients = sseClients.filter(c => c !== res);
  });
});

// ============================================================
// CACHE (REDIS)
// ============================================================
async function cache(req, res, next) {
  const key = req.originalUrl;
  const cached = await redisClient.get(key);

  if (cached) return res.json(JSON.parse(cached));

  res.sendResponse = res.json;
  res.json = async (body) => {
    await redisClient.setEx(key, 30, JSON.stringify(body));
    res.sendResponse(body);
  };

  next();
}

// ============================================================
// API INTRO
// ============================================================

app.get("/intro", auth, cache, async (req, res) => {
  const data = await Intro.find().sort({ _id: -1 });
  res.json(data);
});

app.get("/intro/count", auth, cache, async (req, res) => {
  const count = await Intro.countDocuments();
  res.json({ count });
});

app.post("/intro", auth, async (req, res) => {
  const data = new Intro(req.body);
  await data.save();

  broadcastSSE("new_intro", data);

  res.json({ status: "ok" });
});

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
// START SERVER
// ============================================================
app.listen(3000, () => {
  console.log("🚀 HARDENED SERVER RUNNING");
});
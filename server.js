const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const redis = require("redis");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");

const app = express();

// ================= SECURITY =================
app.use(helmet());
app.use(mongoSanitize());

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ================= RATE LIMIT =================
app.use(rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: { error: "Too many requests" }
}));

// ================= REDIS =================
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379"
});

redisClient.connect()
  .then(() => console.log("⚡ Redis Connected"))
  .catch(err => console.log("❌ Redis Error", err));

// ================= DB =================
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ Mongo Error", err));

// ================= SCHEMA =================
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

// ================= SSE =================
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

// ================= CACHE =================
async function cache(req, res, next) {
  try {
    const key = req.originalUrl;
    const cached = await redisClient.get(key);

    if (cached) return res.json(JSON.parse(cached));

    res.sendResponse = res.json;
    res.json = async (body) => {
      try {
        await redisClient.setEx(key, 60, JSON.stringify(body));
      } catch {}
      res.sendResponse(body);
    };

    next();
  } catch {
    next();
  }
}

// ================= ROUTES =================

// GET ALL
app.get("/intro", cache, async (req, res) => {
  const data = await Intro.find().sort({ _id: -1 });
  res.json(data);
});

// COUNT
app.get("/intro/count", cache, async (req, res) => {
  const count = await Intro.countDocuments();
  res.json({ count });
});

// CREATE
app.post("/intro", async (req, res) => {
  try {
    const data = new Intro(req.body);
    await data.save();

    broadcastSSE("new_intro", data);

    res.json({ status: "ok", data });
  } catch (err) {
    res.status(500).json({ error: "Failed to save" });
  }
});

// DELETE
app.delete("/intro/:id", async (req, res) => {
  try {
    await Intro.findByIdAndDelete(req.params.id);

    broadcastSSE("delete_intro", { _id: req.params.id });

    res.json({ status: "deleted" });
  } catch {
    res.status(500).json({ error: "Delete failed" });
  }
});

// ================= SSE STREAM (FIXED) =================
app.get("/intro/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders?.();

  sseClients.push(res);

  const ping = setInterval(() => {
    res.write(": ping\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    sseClients = sseClients.filter(c => c !== res);
  });
});

// ================= ROOT =================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================= ERROR HANDLER =================
process.on("uncaughtException", (err) => {
  console.log("❌ CRASH:", err);
});

process.on("unhandledRejection", (err) => {
  console.log("❌ PROMISE ERROR:", err);
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on", PORT);
});
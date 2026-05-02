const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

// 🔥 CONNECT DATABASE
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI environment variable tidak diset! Tambahkan di Railway.");
  process.exit(1);
}
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ MongoDB Error:", err));

// ============================================================
// SCHEMAS
// ============================================================

// Intro member FF
const IntroSchema = new mongoose.Schema({
  ffId:       String,
  namaInGame: String,
  namaReal:   String,
  levelAkun:  Number,
  usia:       Number,
  gender:     String,
  kota:       String,
  tanggal:    String,
  waktu:      String,
}, { timestamps: true });

const Intro = mongoose.model("Intro", IntroSchema);

// Chat messages
const MsgSchema = new mongoose.Schema({
  room:      { type: String, required: true, index: true },
  userId:    { type: String, required: true },
  user:      { type: String, required: true },
  role:      { type: String, default: "user" },
  text:      { type: String, default: "" },
  img:       { type: String, default: null },
  time:      { type: String, default: "" },
  day:       { type: String, default: "" },
  replyTo:   { type: mongoose.Schema.Types.Mixed, default: null },
  reactions: { type: Object, default: {} },
  ts:        { type: Number, default: () => Date.now() },
}, { timestamps: true });

const Msg = mongoose.model("Msg", MsgSchema);

// ============================================================
// SSE (untuk intro realtime)
// ============================================================
let sseClients = [];

function broadcastSSE(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter(client => {
    try { client.write(payload); return true; }
    catch { return false; }
  });
}

// ============================================================
// 🤖 CHATBOT — Anthropic Claude Haiku
// ============================================================
app.post("/api/chat", async (req, res) => {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_KEY) {
    return res.json({
      content: [{ type: "text", text: "ANTHROPIC_API_KEY belum diset di environment variable." }]
    });
  }

  try {
    const userMessage = req.body.message;
    if (!userMessage) return res.json({ content: [{ type: "text", text: "Pesan kosong." }] });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: "Kamu adalah asisten admin website intro Free Fire. Jawab singkat, jelas, dan ramah dalam Bahasa Indonesia.",
        messages: [{ role: "user", content: userMessage }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.log("Anthropic error:", data);
      return res.json({ content: [{ type: "text", text: "AI error — cek API key di environment variable." }] });
    }

    const reply = data.content?.[0]?.text || "Maaf, tidak ada respons dari AI.";
    res.json({ content: [{ type: "text", text: reply }] });

  } catch (err) {
    console.error("CHAT ERROR:", err);
    res.json({ content: [{ type: "text", text: "Server error — cek logs." }] });
  }
});

// ============================================================
// COMMUNITY CHAT ROUTES  /api/community/:room
// ============================================================
const VALID_ROOMS = ["umum", "ngobrol", "carimabar", "tips"];
const MAX_MSGS = 200;

// GET pesan
app.get("/api/community/:room", async (req, res) => {
  const { room } = req.params;
  if (!VALID_ROOMS.includes(room)) return res.status(400).json({ error: "Room tidak valid" });
  try {
    const msgs = await Msg.find({ room }).sort({ ts: 1 }).limit(MAX_MSGS).lean();
    res.json({ ok: true, msgs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST pesan baru
app.post("/api/community/:room", async (req, res) => {
  const { room } = req.params;
  if (!VALID_ROOMS.includes(room)) return res.status(400).json({ error: "Room tidak valid" });
  try {
    const { userId, user, role, text, img, time, day, replyTo } = req.body;
    if (!userId || !user) return res.status(400).json({ error: "userId & user wajib" });
    if (!text && !img)    return res.status(400).json({ error: "text atau img wajib" });
    if (text && text.length > 500) return res.status(400).json({ error: "Pesan max 500 karakter" });

    // Trim pesan lama kalau sudah penuh
    const count = await Msg.countDocuments({ room });
    if (count >= MAX_MSGS) {
      const oldest = await Msg.find({ room }).sort({ ts: 1 }).limit(count - MAX_MSGS + 1).select("_id");
      await Msg.deleteMany({ _id: { $in: oldest.map(d => d._id) } });
    }

    const doc = await Msg.create({ room, userId, user, role: role || "user", text, img, time, day, replyTo, reactions: {}, ts: Date.now() });
    res.json({ ok: true, msg: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH reaksi emoji
app.patch("/api/community/:room/:msgId/react", async (req, res) => {
  try {
    const { emoji, userId } = req.body;
    if (!emoji || !userId) return res.status(400).json({ error: "emoji & userId wajib" });
    const doc = await Msg.findById(req.params.msgId);
    if (!doc) return res.status(404).json({ error: "Pesan tidak ditemukan" });

    const reactions = { ...(doc.reactions || {}) };
    const meKey = emoji + "_" + userId;
    if (reactions[meKey]) {
      reactions[emoji] = Math.max(0, (reactions[emoji] || 1) - 1);
      delete reactions[meKey];
    } else {
      reactions[emoji] = (reactions[emoji] || 0) + 1;
      reactions[meKey] = true;
    }
    doc.reactions = reactions;
    doc.markModified("reactions");
    await doc.save();
    res.json({ ok: true, reactions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE pesan
app.delete("/api/community/:room/:msgId", async (req, res) => {
  try {
    const { userId, role } = req.body;
    const doc = await Msg.findById(req.params.msgId);
    if (!doc) return res.status(404).json({ error: "Pesan tidak ditemukan" });
    if (doc.userId !== userId && role !== "admin") return res.status(403).json({ error: "Tidak boleh hapus pesan orang lain" });
    await doc.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// INTRO ROUTES
// ============================================================

// SSE stream
app.get("/intro/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(ping); }
  }, 25000);

  sseClients.push(res);

  req.on("close", () => {
    clearInterval(ping);
    sseClients = sseClients.filter(c => c !== res);
  });
});

// GET semua intro
app.get("/intro", async (req, res) => {
  try {
    const data = await Intro.find().sort({ _id: -1 });
    res.json(data);
  } catch {
    res.status(500).json({ error: "Gagal ambil data" });
  }
});

// COUNT
app.get("/intro/count", async (req, res) => {
  try {
    const count = await Intro.countDocuments();
    res.json({ count });
  } catch {
    res.status(500).json({ count: 0 });
  }
});

// POST intro baru
app.post("/intro", async (req, res) => {
  try {
    const data = new Intro(req.body);
    await data.save();
    broadcastSSE("new_intro", data);
    res.json({ status: "ok", data });
  } catch {
    res.status(500).json({ error: "Gagal simpan data" });
  }
});

// PUT edit intro
app.put("/intro/:id", async (req, res) => {
  try {
    const updated = await Intro.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Data tidak ditemukan" });
    res.json({ status: "ok", data: updated });
  } catch {
    res.status(500).json({ error: "Gagal update data" });
  }
});

// DELETE intro
app.delete("/intro/:id", async (req, res) => {
  try {
    await Intro.findByIdAndDelete(req.params.id);
    broadcastSSE("delete_intro", { _id: req.params.id });
    res.json({ status: "ok" });
  } catch {
    res.status(500).json({ error: "Gagal hapus data" });
  }
});

// ROOT
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server jalan di port ${PORT}`));

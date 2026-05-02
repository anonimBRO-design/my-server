const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🔥 CONNECT DATABASE
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI environment variable tidak diset! Tambahkan di Railway.");
  process.exit(1);
}
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.log("❌ MongoDB Error:", err));

// 🔥 SCHEMA
const IntroSchema = new mongoose.Schema({
ffId:       String,
namaInGame: String,
namaReal:   String,
levelAkun:  Number,
usia:       Number,
gender:     String,   // ✅ FIX Bug 1: field gender sebelumnya hilang
kota:       String,
tanggal:    String,
waktu:      String,
}, { timestamps: true });

const Intro = mongoose.model("Intro", IntroSchema);

// ============================================================
// SSE
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
// 🤖 CHATBOT — Anthropic Claude (server-side, API key aman)
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
// ROUTES
// ============================================================

// 🔥 SSE
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

// 🔥 GET
app.get("/intro", async (req, res) => {
try {
const data = await Intro.find().sort({ _id: -1 });
res.json(data);
} catch {
res.status(500).json({ error: "Gagal ambil data" });
}
});

// 🔥 COUNT
app.get("/intro/count", async (req, res) => {
try {
const count = await Intro.countDocuments();
res.json({ count });
} catch {
res.status(500).json({ count: 0 });
}
});

// 🔥 POST
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

// 🔥 PUT
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

// 🔥 DELETE
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

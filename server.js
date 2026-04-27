const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🔥 CONNECT DATABASE
mongoose.connect(process.env.MONGO_URI || "mongodb+srv://axiooxjkt48pro_db_user:LwEII86ghHvHxhJ0@intro.ifepmi9.mongodb.net/introDB")
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.log("❌ MongoDB Error:", err));

// 🔥 SCHEMA
const IntroSchema = new mongoose.Schema({
ffId:       String,
namaInGame: String,
namaReal:   String,
levelAkun:  Number,
usia:       Number,
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
// 🤖 CHATBOT FIX — Hugging Face (VERSI BENAR)
// ============================================================
app.post("/api/chat", async (req, res) => {
const HF_TOKEN = process.env.HF_TOKEN;

if (!HF_TOKEN) {
return res.status(500).json({
content: [{ type: "text", text: "HF_TOKEN belum diset" }]
});
}

try {
const userMessage = req.body.message;

```
const response = await fetch(
  "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: "Kamu adalah admin assistant website intro Free Fire. Jawab singkat dan jelas: " + userMessage
    })
  }
);

const data = await response.json();

const reply = data?.[0]?.generated_text || "AI tidak merespon";

res.json({
  content: [
    { type: "text", text: reply }
  ]
});
```

} catch (err) {
console.error("CHAT ERROR:", err);
res.status(500).json({
content: [
{ type: "text", text: "Server error" }
]
});
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

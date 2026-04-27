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
// SSE — daftar semua client yang sedang konek
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
// ROUTES
// ============================================================

// 🤖 CHATBOT PROXY — Hugging Face (hindari CORS browser)
app.post("/api/chat", async (req, res) => {
  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) {
    return res.status(500).json({ error: "HF_TOKEN belum dikonfigurasi di server." });
  }

  try {
    const { system, messages, max_tokens } = req.body;

    // Gabungkan system prompt ke messages (format HF)
    const fullMessages = system
      ? [{ role: "system", content: system }, ...messages]
      : messages;

    const response = await fetch(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${HF_TOKEN}`,
        },
        body: JSON.stringify({
          model: "mistralai/Mistral-7B-Instruct-v0.3",
          messages: fullMessages,
          max_tokens: max_tokens || 400,
          temperature: 0.7,
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("HF API error:", err);
      return res.status(response.status).json({ error: "HF API gagal: " + err });
    }

    const data = await response.json();

    // Konversi format HF → format Anthropic yang dipakai frontend
    const replyText = data.choices?.[0]?.message?.content || "Maaf, tidak ada respons.";
    res.json({ content: [{ type: "text", text: replyText }] });

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Gagal menghubungi Hugging Face API." });
  }
});

// 🔥 SSE — admin subscribe realtime
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

// 🔥 GET — ambil semua data
app.get("/intro", async (req, res) => {
  try {
    const data = await Intro.find().sort({ _id: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Gagal ambil data" });
  }
});

// 🔥 GET count
app.get("/intro/count", async (req, res) => {
  try {
    const count = await Intro.countDocuments();
    res.json({ count });
  } catch {
    res.status(500).json({ count: 0 });
  }
});

// 🔥 POST — simpan data baru
app.post("/intro", async (req, res) => {
  try {
    const data = new Intro(req.body);
    await data.save();
    broadcastSSE("new_intro", data);
    res.json({ status: "ok", data });
  } catch (err) {
    res.status(500).json({ error: "Gagal simpan data" });
  }
});

// 🔥 PUT — edit data by _id
app.put("/intro/:id", async (req, res) => {
  try {
    const updated = await Intro.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Data tidak ditemukan" });
    res.json({ status: "ok", data: updated });
  } catch (err) {
    res.status(500).json({ error: "Gagal update data" });
  }
});

// 🔥 DELETE — hapus data by _id
app.delete("/intro/:id", async (req, res) => {
  try {
    await Intro.findByIdAndDelete(req.params.id);
    broadcastSSE("delete_intro", { _id: req.params.id });
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: "Gagal hapus data" });
  }
});

// ROOT
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server jalan di port ${PORT}`));

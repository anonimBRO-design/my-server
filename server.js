const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🔥 CONNECT DATABASE
mongoose.connect("mongodb+srv://axiooxjkt48pro_db_user:LwEII86ghHvHxhJ0@intro.ifepmi9.mongodb.net/introDB")
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

// 🔥 SSE — admin subscribe realtime
app.get("/intro/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // kirim ping tiap 25 detik biar koneksi ga putus
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

// 🔥 GET count — cek jumlah data (ringan, untuk polling fallback)
app.get("/intro/count", async (req, res) => {
  try {
    const count = await Intro.countDocuments();
    res.json({ count });
  } catch {
    res.status(500).json({ count: 0 });
  }
});

// 🔥 POST — simpan data baru + broadcast ke semua admin
app.post("/intro", async (req, res) => {
  try {
    const data = new Intro(req.body);
    await data.save();

    // broadcast ke semua admin yang konek SSE
    broadcastSSE("new_intro", data);

    res.json({ status: "ok", data });
  } catch (err) {
    res.status(500).json({ error: "Gagal simpan data" });
  }
});

// 🔥 DELETE — hapus data by MongoDB _id
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

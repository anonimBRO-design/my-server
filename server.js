const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🔥 CONNECT DATABASE
mongoose.connect("mongodb+srv://axiooxjkt48pro_db_user:<1r9CkEKNyF5OjyuO>@cluster0.qw4wm0l.mongodb.net/?appName=Cluster0")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// 🔥 SCHEMA
const IntroSchema = new mongoose.Schema({
    ffId: String,
    namaInGame: String,
    namaReal: String,
    levelAkun: String,
    usia: Number,
    kota: String,
    tanggal: String,
    waktu: String
});

const Intro = mongoose.model("Intro", IntroSchema);

// 🔥 POST
app.post("/intro", async (req, res) => {
    const data = new Intro(req.body);
    await data.save();
    res.json({ status: "ok" });
});

// 🔥 GET
app.get("/intro", async (req, res) => {
    const data = await Intro.find().sort({ _id: -1 });
    res.json(data);
});

// ROOT
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index intro.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server jalan di " + PORT);
});
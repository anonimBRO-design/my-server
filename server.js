const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// 🔥 INI YANG BIKIN HTML LU KELOAD
app.use(express.static(path.join(__dirname, "public")));

let data = [];

// 🔥 API
app.post("/intro", (req, res) => {
    data.unshift(req.body);
    res.json({ status: "ok" });
});

app.get("/intro", (req, res) => {
    res.json(data);
});

// 🔥 ROOT → TAMPILIN HTML
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index intro.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server jalan di " + PORT);
});
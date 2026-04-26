const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let data = [];

app.post("/intro", (req, res) => {
    data.unshift(req.body);
    res.json({ status: "ok" });
});

app.get("/", (req, res) => {
    res.send("SERVER INTRO FF AKTIF 🔥");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server jalan di " + PORT);
});
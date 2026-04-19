const express = require("express");
const app = express();

// route utama
app.get("/", (req, res) => {
  res.send("Halo dari server Node.js 🚀");
});

// port (WAJIB buat deploy)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server jalan di port " + PORT);
});const express = require("express");
const app = express();
const path = require("path");

// Serve folder public
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server jalan di port " + PORT);
});
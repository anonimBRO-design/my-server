const express = require('express')
const path = require('path')
const app = express()

// serve file static
app.use(express.static(path.join(__dirname, 'public')))

// route root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

// IMPORTANT: pakai PORT dari Railway
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log('Server jalan di port ' + PORT)
})
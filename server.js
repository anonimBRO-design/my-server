const express = require('express')
const path = require('path')
const app = express()

// serve folder public
app.use(express.static(path.join(__dirname, 'public')))

// route root wajib
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

// port railway
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log('Server jalan di ' + PORT)
})
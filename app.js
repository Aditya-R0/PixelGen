const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const app = express();

// Configuration
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new sqlite3.Database('pixels.db', (err) => {
  if (err) console.error(err.message);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS pixels (
      id TEXT PRIMARY KEY,
      name TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pixel_id TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip TEXT,
      user_agent TEXT,
      FOREIGN KEY(pixel_id) REFERENCES pixels(id)
    )
  `);
});

// Routes
app.get('/', (req, res) => {
  db.all("SELECT * FROM pixels", [], (err, pixels) => {
    if (err) return console.error(err);
    res.render('index', { 
      pixels,
      baseUrl: `${req.protocol}://${req.get('host')}`
    });
  });
});

app.post('/create', (req, res) => {
  const pixelId = uuidv4();
  db.run("INSERT INTO pixels (id, name) VALUES (?, ?)", 
    [pixelId, req.body.name || 'Untitled Pixel'],
    (err) => {
      if (err) return console.error(err);
      res.redirect('/');
    }
  );
});

app.get('/tracker/:id.png', (req, res) => {
  const ip = req.ip;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  db.run("INSERT INTO logs (pixel_id, ip, user_agent) VALUES (?, ?, ?)", 
    [req.params.id, ip, userAgent], 
    (err) => {
      if (err) console.error(err);
      res.sendFile(path.join(__dirname, 'public/images/pixel.png'));
    }
  );
});

app.get('/logs/:id', (req, res) => {
  db.get("SELECT * FROM pixels WHERE id = ?", [req.params.id], (err, pixel) => {
    db.all("SELECT * FROM logs WHERE pixel_id = ?", [req.params.id], (err, logs) => {
      res.render('logs', { 
        pixel,
        logs,
        baseUrl: `${req.protocol}://${req.get('host')}`
      });
    });
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors'); // Added CORS support
const app = express();
// Add at the top of app.js
const dedupCache = new Map();



// Enable CORS for all origins (essential for extension)
app.use(cors());

// Configuration
app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.json()); // Added JSON body parser
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new sqlite3.Database('pixels.db', async (err) => {
  if (err) return console.error(err.message);
  
  await new Promise((resolve) => 
    db.run(`
    CREATE TABLE IF NOT EXISTS pixels (
      id TEXT PRIMARY KEY,
      name TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, resolve)
  );
  
   await new Promise((resolve) => 
    db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pixel_id TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip TEXT,
      user_agent TEXT,
      FOREIGN KEY(pixel_id) REFERENCES pixels(id)
    )
  `, resolve)
  );
  console.log("Tables verified/created");
});

// Routes
app.get('/', (req, res) => {
  db.all("SELECT * FROM pixels", [], (err, pixels) => {
    if (err) {
      console.error('Error fetching pixels:', err);
      return res.status(500).send('Server error');
    }
    res.render('index', { 
      pixels,
      baseUrl: `${req.protocol}://${req.get('host')}`
    });
  });
});

// Create new pixel endpoint
app.post('/create', (req, res) => {
  const pixelId = uuidv4();
  const name = req.body.name || 'Untitled Pixel';
  
  db.run("INSERT INTO pixels (id, name) VALUES (?, ?)", 
    [pixelId, name],
    (err) => {
      if (err) {
        console.error('Error creating pixel:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      // Return JSON with pixel URL
      res.json({
        url: `${req.protocol}://${req.get('host')}/tracker/${pixelId}.png`
      });
    }
  );
});

// Pixel tracking endpoint
// Pixel tracking endpoint with deduplication
app.get('/tracker/:id.png', (req, res) => {
  const pixelId = req.params.id;
  const ip = req.clientIp; // Using request-ip middleware
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  // Deduplication key = pixelId + IP
  const dedupKey = `${pixelId}-${ip}`;
  
  // Skip if request from same IP within 5 minutes
  if (dedupCache.has(dedupKey)) {
    return res.sendFile(path.join(__dirname, 'public/images/pixel.png'));
  }
  
  // Add to cache with 5-minute expiration
  dedupCache.set(dedupKey, true);
  setTimeout(() => dedupCache.delete(dedupKey), 300000000); // 5 minutes
  
  // Log to database
  db.run(
    "INSERT INTO logs (pixel_id, ip, user_agent) VALUES (?, ?, ?)", 
    [pixelId, ip, userAgent], 
    (err) => {
      if (err) console.error('Logging error:', err);
      res.sendFile(path.join(__dirname, 'public/images/pixel.png'));
    }
  );
});

// View logs endpoint
app.get('/logs/:id', (req, res) => {
  const pixelId = req.params.id;
  
  db.get("SELECT * FROM pixels WHERE id = ?", [pixelId], (err, pixel) => {
    if (err) {
      console.error('Error fetching pixel:', err);
      return res.status(500).send('Server error');
    }
    
    db.all("SELECT * FROM logs WHERE pixel_id = ?", [pixelId], (err, logs) => {
      if (err) {
        console.error('Error fetching logs:', err);
        return res.status(500).send('Server error');
      }
      
      res.render('logs', { 
        pixel,
        logs,
        baseUrl: `${req.protocol}://${req.get('host')}`
      });
    });
  });
});

// Add this after your existing routes in app.js
app.get('/check', (req, res) => {
  const since = req.query.since || Date.now() - 3600000;
  const sinceDate = new Date(parseInt(since));
  const formattedSince = sinceDate.toISOString()
  .replace('T', ' ')
  .substring(0, 19);  // Modified query to get first open per pixel
  db.all(
    `SELECT pixel_id, ip FROM logs WHERE timestamp > ? ORDER BY pixel_id, timestamp`,
      [formattedSince],
      (err, rows) => {
      if (err) {
        console.error('Error fetching logs:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      const result = {};
      rows.forEach(row => {
        if (!result[row.pixel_id]) result[row.pixel_id] = new Set();
        result[row.pixel_id].add(row.ip);
      });
      // Format as required
      const openedPixels = Object.entries(result).map(([id, ips]) => ({
        id,
        ips: Array.from(ips)
      }));
      res.json({ openedPixels });
    }
  );
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors'); // Added CORS support
const app = express();

// Enable CORS for all origins (essential for extension)
app.use(cors());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  next();
});
// Configuration
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.json()); // Added JSON body parser
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new sqlite3.Database('pixels.db', (err) => {
  if (err) {
    console.error('Database error:', err.message);
  } else {
    console.log('Connected to SQLite database');
  }
  
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
app.get('/tracker/:id.png', (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pixelId)) {
    console.warn(`Invalid pixel ID format: ${pixelId}`);
    return res.sendFile(path.join(__dirname, 'public/images/pixel.png'));
  }
  const pixelId = req.params.id;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';

  console.log(`Pixel accessed: ${pixelId}`); // Add logging

  // 1. Verify pixel exists before logging
  db.get("SELECT id FROM pixels WHERE id = ?", [pixelId], (err, pixel) => {
    if (err) {
      console.error('Pixel validation error:', err);
      return res.sendFile(path.join(__dirname, 'public/images/pixel.png'));
    }
    
    if (!pixel) {
      console.warn(`Unknown pixel accessed: ${pixelId}`);
      return res.sendFile(path.join(__dirname, 'public/images/pixel.png'));
    }

    // 2. Insert log with error handling
    db.run(
      "INSERT INTO logs (pixel_id, ip, user_agent) VALUES (?, ?, ?)",
      [pixelId, ip, userAgent],
      (err) => {
        if (err) {
          console.error('Log INSERT error:', err.message);
        } else {
          console.log(`Logged access for pixel: ${pixelId}`);
        }
        
        // 3. Disable caching
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        res.sendFile(path.join(__dirname, 'public/images/pixel.png'));
      }
    );
  });
});

// View logs endpoint
app.get('/logs/:id', (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pixelId)) {
    return res.status(400).send('Invalid pixel ID');
  }
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
  
  // Modified query to get first open per pixel
  const query = `
    SELECT pixel_id, MIN(timestamp) AS first_open
    FROM logs
    WHERE timestamp > ?
    GROUP BY pixel_id
  `;
  
  db.all(query, [new Date(parseInt(since)).toISOString().replace('T', ' ').substring(0, 19)], (err, logs) => {
    if (err) {
      console.error('Error fetching logs:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json({
      openedPixels: logs.map(log => ({
        id: log.pixel_id,
        timestamp: log.first_open
      }))
    });
  });
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

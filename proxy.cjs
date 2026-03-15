const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());

const BASE_URL = 'https://external.transitapp.com';

app.get('/api/nearby_routes', async (req, res) => {
  try {
    const params = new URLSearchParams(req.query);
    const response = await fetch(`${BASE_URL}/v3/public/nearby_routes?${params}`, {
      headers: { apiKey: process.env.VITE_TRANSIT_API_KEY }
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/nearby_stops', async (req, res) => {
  try {
    const params = new URLSearchParams(req.query);
    const response = await fetch(`${BASE_URL}/v3/public/nearby_stops?${params}`, {
      headers: { apiKey: process.env.VITE_TRANSIT_API_KEY }
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/plan', async (req, res) => {
  try {
    const params = new URLSearchParams(req.query);
    const response = await fetch(`${BASE_URL}/v3/public/plan?${params}`, {
      headers: { apiKey: process.env.VITE_TRANSIT_API_KEY }
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/trip_plan', async (req, res) => {
  try {
    const params = new URLSearchParams(req.query);
    const response = await fetch(`${BASE_URL}/v3/public/trip_plan?${params}`, {
      headers: { apiKey: process.env.VITE_TRANSIT_API_KEY }
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { platform } from 'os';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENWEATHER_API_KEY;

// Helper: fetch with a hard timeout (default 8 s) to prevent hanging requests
async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

if (!API_KEY) {
  console.error('ERROR: OPENWEATHER_API_KEY is not defined in the .env file!');
  process.exit(1);
}

// Enable CORS
app.use(cors());

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint for weather proxy (current + forecast)
app.get('/api/weather', async (req, res) => {
  const city = req.query.city || 'Tavira';
  
  try {
    const currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric&lang=pt`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric&lang=pt`;
    
    // Fetch both concurrently (8 s timeout each)
    const [currentResponse, forecastResponse] = await Promise.all([
      fetchWithTimeout(currentUrl),
      fetchWithTimeout(forecastUrl)
    ]);
    
    if (!currentResponse.ok) {
      const errorText = await currentResponse.text();
      return res.status(currentResponse.status).json({ 
        error: `Error fetching current weather: ${currentResponse.statusText}`,
        details: errorText
      });
    }
    
    if (!forecastResponse.ok) {
      const errorText = await forecastResponse.text();
      return res.status(forecastResponse.status).json({ 
        error: `Error fetching forecast: ${forecastResponse.statusText}`,
        details: errorText
      });
    }
    
    const currentData = await currentResponse.json();
    const forecastData = await forecastResponse.json();
    
    res.json({
      current: currentData,
      forecast: forecastData
    });
  } catch (error) {
    console.error('Weather API Proxy Error:', error);
    const isTimeout = error.name === 'AbortError';
    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout
        ? 'Timeout ao obter dados meteorológicos (API externa demorou demasiado).'
        : 'Erro interno ao obter dados meteorológicos.'
    });
  }
});

// -------------------------------------------------------
// Widget data endpoint: air temp + sea temp + 7-day forecast
// Uses OpenWeather for current air, Open-Meteo (free) for sea & daily
// -------------------------------------------------------
app.get('/api/widget-data', async (req, res) => {
  // Tavira coordinates
  const LAT = 37.1273;
  const LON = -7.6486;

  try {
    const [currentRes, marineRes, forecastRes] = await Promise.all([
      // Current air temperature (OpenWeather) — 8 s timeout
      fetchWithTimeout(`https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&appid=${API_KEY}&units=metric&lang=pt`),
      // Sea surface temperature (Open-Meteo Marine - free, no key) — 8 s timeout
      fetchWithTimeout(`https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}&current=sea_surface_temperature`),
      // 7-day daily forecast (Open-Meteo - free, no key) — 8 s timeout
      fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Europe%2FLisbon&forecast_days=7`)
    ]);

    const [current, marine, forecast] = await Promise.all([
      currentRes.json(),
      marineRes.json(),
      forecastRes.json()
    ]);

    res.json({
      airTemp: Math.round(current.main.temp),
      feelsLike: Math.round(current.main.feels_like),
      weatherDesc: current.weather[0].description,
      weatherCode: current.weather[0].id,
      seaTemp: marine.current?.sea_surface_temperature != null
        ? Math.round(marine.current.sea_surface_temperature)
        : null,
      forecast: forecast.daily
    });
  } catch (err) {
    console.error('Widget API error:', err);
    const isTimeout = err.name === 'AbortError';
    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? 'Timeout ao obter dados meteorológicos (API externa demorou demasiado).' : 'Erro ao obter dados do widget.'
    });
  }
});

// Fallback to index.html for single page app experience
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Server is running at ${url}`);

  // Open browser automatically (cross-platform)
  const os = platform();
  const openCmd = os === 'win32' ? `start ${url}`
               : os === 'darwin' ? `open ${url}`
               : `xdg-open ${url}`; // Linux

  exec(openCmd, (err) => {
    if (err) console.warn('Could not open browser automatically:', err.message);
  });
});

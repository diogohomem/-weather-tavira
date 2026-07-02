/* =============================================
   Weather Tavira - App Logic (app.js)
   ============================================= */

'use strict';

// -----------------------------------
// Constants
// -----------------------------------
const DEFAULT_CITY = 'Tavira';
const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// -----------------------------------
// DOM Selectors
// -----------------------------------
const cityNameEl      = document.getElementById('city-name');
const currentDateEl   = document.getElementById('current-date');
const tempValEl       = document.getElementById('temp-val');
const weatherIconEl   = document.getElementById('weather-icon');
const weatherDescEl   = document.getElementById('weather-desc');
const tempMaxEl       = document.getElementById('temp-max');
const tempMinEl       = document.getElementById('temp-min');
const humidityValEl   = document.getElementById('humidity-val');
const windValEl       = document.getElementById('wind-val');
const feelsLikeValEl  = document.getElementById('feels-like-val');
const pressureValEl   = document.getElementById('pressure-val');
const hourlyListEl    = document.getElementById('hourly-list');
const weeklyListEl    = document.getElementById('weekly-list');
const weatherCardEl   = document.getElementById('weather-card');
const errorMessageEl  = document.getElementById('error-message');
const errorTextEl     = document.getElementById('error-text');
const searchFormEl    = document.getElementById('search-form');
const searchInputEl   = document.getElementById('search-input');
const errorCloseBtnEl = document.getElementById('error-close-btn');
const seaTempEl       = document.getElementById('sea-temp-val');

// -----------------------------------
// Helpers
// -----------------------------------

/**
 * Format a Date object to a Portuguese string
 */
function formatDate(date) {
  // Use UTC* methods: new Date((dt + timezone)*1000) already shifts the timestamp
  // so UTC values represent the correct local time at the weather location.
  const dayName  = DAYS_PT[date.getUTCDay()];
  const day      = date.getUTCDate();
  const month    = MONTHS_PT[date.getUTCMonth()];
  return `${dayName}, ${day} ${month}`;
}

/**
 * Format a unix timestamp into HH:MM
 */
function formatHour(unixTs, timezoneOffset = 0) {
  const date = new Date((unixTs + timezoneOffset) * 1000);
  // Use UTC because we've already applied the offset
  return date.toUTCString().slice(17, 22);
}

/**
 * Round temperature
 */
function roundTemp(t) {
  return Math.round(t);
}

/**
 * Convert m/s to km/h
 */
function msToKmh(ms) {
  return Math.round(ms * 3.6);
}

/**
 * Apply a background theme to the body based on weather conditions and time
 */
function applyTheme(weatherId, isDay) {
  document.body.classList.remove('theme-sunny', 'theme-cloudy', 'theme-rainy', 'theme-night');
  if (!isDay) {
    document.body.classList.add('theme-night');
    return;
  }
  // Thunderstorm, Drizzle, Rain
  if (weatherId >= 200 && weatherId < 700) {
    document.body.classList.add('theme-rainy');
  }
  // Clear
  else if (weatherId === 800) {
    document.body.classList.add('theme-sunny');
  }
  // Clouds
  else if (weatherId > 800) {
    document.body.classList.add('theme-cloudy');
  }
}

/**
 * Get the OpenWeather icon URL
 */
function iconUrl(iconCode, size = '@2x') {
  return `https://openweathermap.org/img/wn/${iconCode}${size}.png`;
}

// -----------------------------------
// Error handling
// -----------------------------------
function showError(message) {
  errorTextEl.textContent = message;
  errorMessageEl.classList.remove('hidden');
  weatherCardEl.classList.add('loading');
}

function hideError() {
  errorMessageEl.classList.add('hidden');
}

errorCloseBtnEl.addEventListener('click', () => {
  hideError();
  weatherCardEl.classList.remove('loading');
});

// -----------------------------------
// Render Functions
// -----------------------------------

function renderCurrentWeather(data) {
  const { name, sys, main, weather, wind, dt, timezone } = data;

  // Date & location
  const nowDate = new Date((dt + timezone) * 1000);
  cityNameEl.textContent = `${name}, ${sys.country}`;
  currentDateEl.textContent = formatDate(nowDate);

  // Temperature
  tempValEl.textContent = roundTemp(main.temp);
  tempMaxEl.textContent = roundTemp(main.temp_max);
  tempMinEl.textContent = roundTemp(main.temp_min);
  feelsLikeValEl.textContent = `${roundTemp(main.feels_like)} °C`;

  // Weather description & icon
  const w = weather[0];
  weatherDescEl.textContent = w.description;
  weatherIconEl.src = iconUrl(w.icon);
  weatherIconEl.alt = w.description;
  weatherIconEl.classList.remove('hidden');

  // Stats
  humidityValEl.textContent  = `${main.humidity} %`;
  windValEl.textContent      = `${msToKmh(wind.speed)} km/h`;
  pressureValEl.textContent  = `${main.pressure} hPa`;

  // Determine if it's day or night (d = day, n = night suffix in icon code)
  const isDay = w.icon.endsWith('d');
  applyTheme(w.id, isDay);
}

function renderHourlyForecast(forecastData, timezoneOffset) {
  hourlyListEl.innerHTML = '';

  // Get next 8 items (3h intervals = 24h)
  const items = forecastData.list.slice(0, 8);

  items.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = 'hourly-item';
    if (index === 0) el.classList.add('active');

    const time     = index === 0 ? 'Agora' : formatHour(item.dt, timezoneOffset);
    const icon     = item.weather[0].icon;
    const temp     = roundTemp(item.main.temp);
    const rainProb = item.pop !== undefined ? Math.round(item.pop * 100) : 0;

    el.innerHTML = `
      <span class="hourly-time">${time}</span>
      <img class="hourly-icon" src="${iconUrl(icon, '')}" alt="${item.weather[0].description}" loading="lazy">
      <span class="hourly-temp">${temp}°</span>
      ${rainProb > 0 ? `<span class="hourly-rain"><i class="fa-solid fa-droplet" style="font-size:0.6rem;"></i> ${rainProb}%</span>` : ''}
    `;
    hourlyListEl.appendChild(el);
  });
}

function renderWeeklyForecast(forecastData) {
  weeklyListEl.innerHTML = '';

  // Group forecasts by day — use UTC to match the location's timezone offset
  // (timestamps are already shifted: dt values from API are in UTC, we group by
  //  UTC date which matches Tavira time since the API returns UTC timestamps)
  const dailyMap = new Map();
  forecastData.list.forEach((item) => {
    const date = new Date(item.dt * 1000);
    const dayKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
    if (!dailyMap.has(dayKey)) {
      dailyMap.set(dayKey, []);
    }
    dailyMap.get(dayKey).push(item);
  });

  // Take up to 5 days
  const days = Array.from(dailyMap.values()).slice(0, 5);

  days.forEach((dayItems, index) => {
    // Pick item closest to noon for representative data
    const noonItem = dayItems.reduce((prev, curr) => {
      const prevHour = new Date(prev.dt * 1000).getHours();
      const currHour = new Date(curr.dt * 1000).getHours();
      return Math.abs(currHour - 12) < Math.abs(prevHour - 12) ? curr : prev;
    });

    const date     = new Date(noonItem.dt * 1000);
    const dayName  = index === 0 ? 'Hoje' : DAYS_PT[date.getUTCDay()];
    const icon     = noonItem.weather[0].icon;
    const desc     = noonItem.weather[0].description;

    // Get min & max across all intervals that day
    const maxTemp = Math.max(...dayItems.map(i => i.main.temp_max));
    const minTemp = Math.min(...dayItems.map(i => i.main.temp_min));

    const el = document.createElement('div');
    el.className = 'weekly-item';
    el.innerHTML = `
      <span class="weekly-day">${dayName}</span>
      <img class="weekly-icon" src="${iconUrl(icon, '')}" alt="${desc}" loading="lazy">
      <span class="weekly-desc">${desc}</span>
      <div class="weekly-temps">
        <span class="weekly-max">${roundTemp(maxTemp)}°</span>
        <span class="weekly-min">${roundTemp(minTemp)}°</span>
      </div>
    `;
    weeklyListEl.appendChild(el);
  });
}

// -----------------------------------
// Fetch Weather Data
// -----------------------------------
async function fetchWeather(city) {
  // Reset UI to loading state
  weatherCardEl.classList.add('loading');
  hideError();

  // Abort controller for timeout (10 s per request)
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 10000);

  try {
    const [response, widgetRes] = await Promise.all([
      fetch(`/api/weather?city=${encodeURIComponent(city)}`, { signal: controller.signal }),
      fetch('/api/widget-data', { signal: controller.signal }).catch(() => null)  // sea temp — best effort
    ]);

    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `Erro ${response.status} ao obter dados.`);
    }

    const data = await response.json();

    if (!data.current || !data.forecast) {
      throw new Error('Dados da API incompletos.');
    }

    // Sea temperature (Open-Meteo Marine)
    if (widgetRes?.ok && seaTempEl) {
      const widgetData = await widgetRes.json();
      seaTempEl.textContent = widgetData.seaTemp != null
        ? `${widgetData.seaTemp} °C`
        : '—';
    }

    // Render current
    renderCurrentWeather(data.current);
    // Render hourly (next 24h)
    renderHourlyForecast(data.forecast, data.current.timezone);
    // Render weekly (5 days)
    renderWeeklyForecast(data.forecast);

    // Remove loading state
    weatherCardEl.classList.remove('loading');

  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Fetch error:', error);
    const msg = error.name === 'AbortError'
      ? 'O pedido demorou demasiado. Verifica a tua ligação à internet.'
      : (error.message || 'Não foi possível obter os dados meteorológicos.');
    showError(msg);
  }
}

// -----------------------------------
// Search
// -----------------------------------
searchFormEl.addEventListener('submit', () => {
  const city = searchInputEl.value.trim();
  if (city) {
    fetchWeather(city);
    searchInputEl.blur();
  }
});

searchInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const city = searchInputEl.value.trim();
    if (city) {
      fetchWeather(city);
    }
  }
});

// -----------------------------------
// Boot
// -----------------------------------
fetchWeather(DEFAULT_CITY);

// Auto-refresh every 10 minutes
setInterval(() => {
  const city = cityNameEl.textContent.split(',')[0].trim();
  fetchWeather(city);
}, 10 * 60 * 1000);

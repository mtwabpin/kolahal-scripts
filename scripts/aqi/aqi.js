// @title Air quality
// @desc Air quality now: aqi [city] | aqi --default <city> (European index, PM2.5, PM10, NO₂, O₃)
// @author Kolahal
// @version 1.0
// @command
// @usage [<city>|--default <city>]
// @at 08:00
// @tags weather, air, health
// @requires 0.4.1
//
// Talks to: geocoding-api.open-meteo.com and air-quality-api.open-meteo.com (free, no key).
// `aqi`, `aqi Delhi`, `aqi --default Pune`. On a timer (no arguments) it pins the index in the
// header, in the theme's good, warn or bad colour.

// A failure: what didn't work, in the theme's bad colour, and why under it.
const fail = (what, why) => log(fmt.color("bad", what), why);

const line = (argline || "").trim();

const setDefault = line.match(/^--default\s+(.+)$/);
if (setDefault) {
  store.set("city", setDefault[1].trim());
  return log(`Default city: ${fmt.bold(setDefault[1].trim())}`);
}

const city = line || store.get("city");
if (!city) return log(fmt.color("muted", "No city yet: aqi <city>, or aqi --default <city> to save one"));

async function getJson(url) {
  const r = await http.get(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.body);
}

// The European air quality index, in bands: 0–20 good … over 100 extremely poor.
function band(aqi) {
  if (aqi <= 20) return ["Good", "good"];
  if (aqi <= 40) return ["Fair", "good"];
  if (aqi <= 60) return ["Moderate", "warn"];
  if (aqi <= 80) return ["Poor", "warn"];
  if (aqi <= 100) return ["Very poor", "bad"];
  return ["Extremely poor", "bad"];
}

let place, current;
try {
  const geo = await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(city)}`
  );
  if (!geo.results || geo.results.length === 0) return fail("No air quality", `No place named '${city}'`);
  place = geo.results[0];
  const data = await getJson(
    "https://air-quality-api.open-meteo.com/v1/air-quality" +
      `?latitude=${place.latitude}&longitude=${place.longitude}` +
      "&current=european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone&timezone=auto"
  );
  current = data.current;
} catch (e) {
  return fail("No air quality", `${e.message || e}`);
}
if (!current || current.european_aqi == null) return fail("No air quality", "Open-Meteo sent no reading");

const aqi = Math.round(current.european_aqi);
const [label, role] = band(aqi);
const where = [place.name, place.country_code].filter(Boolean).join(", ");

// The place is the title; a column of readings under it, padded so the numbers line up (mono keeps
// the terminal font for that). The index in the colour of its band.
const rows = [
  ["AQI", String(aqi), label],
  ["PM2.5", Math.round(current.pm2_5 ?? 0) + "", "µg/m³"],
  ["PM10", Math.round(current.pm10 ?? 0) + "", "µg/m³"],
  ["NO₂", Math.round(current.nitrogen_dioxide ?? 0) + "", "µg/m³"],
  ["O₃", Math.round(current.ozone ?? 0) + "", "µg/m³"],
];
const nameWidth = Math.max(...rows.map((r) => r[0].length));
const valueWidth = Math.max(...rows.map((r) => r[1].length));
const body = rows
  .map(([name, value, unit], i) => {
    const text = `${name.padEnd(nameWidth)}  ${value.padStart(valueWidth)}  ${unit}`;
    return i === 0 ? fmt.color(role, text) : text;
  })
  .join("\n");

log(where, body, { url: `https://open-meteo.com/en/docs/air-quality-api#latitude=${place.latitude}&longitude=${place.longitude}`, mono: "1" });

if (!line) status(`AQI ${aqi} ${label} · ${place.name}`);

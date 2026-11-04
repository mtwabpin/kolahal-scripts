// @title Air quality
// @desc Air quality now: aqi [city], without one its city option (US, Indian or European index, PM2.5, PM10, NO₂, O₃)
// @author Kolahal
// @version 1.2
// @command
// @usage [<city>]
// @at 08:00
// @tags weather, air, health
// @requires 0.4.7
// @option city "" The city when you type none
// @option scale us|in|eu The index: us (US EPA), in (India's CPCB) or eu (European)
//
// Talks to: geocoding-api.open-meteo.com and air-quality-api.open-meteo.com (free, no key).
// `aqi Delhi`, or `aqi` for its city option (`script set aqi city Pune`); `script set aqi scale in`
// for India's index. On a timer (no arguments) it pins the index in the header, in the theme's
// good, warn or bad colour.

// A failure: what didn't work, in the theme's bad colour, and why under it.
const fail = (what, why) => log(fmt.color("bad", what), why);

const line = (argline || "").trim();

// The default city was saved with --default before it was an option.
const setDefault = line.match(/^--default\s+(.+)$/);
if (setDefault) {
  return log(fmt.color("muted", `The default city is an option now: script set aqi city ${setDefault[1].trim()}`));
}

// A city saved with --default still counts until the option is set.
const city = line || (options.city || "").trim() || store.get("city");
if (!city) return log(fmt.color("muted", "No city yet: aqi <city>, or script set aqi city <city> to keep one"));

async function getJson(url) {
  const r = await http.get(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.body);
}

// The same air reads far apart on the three scales: Delhi one November morning was 202 Very
// unhealthy on the US one, 307 Very poor on India's and 107 Extremely poor on Europe's.
// Each in bands: the band's top, its name and its colour.
const BANDS = {
  us: [[50, "Good", "good"], [100, "Moderate", "warn"], [150, "Unhealthy for sensitive groups", "warn"],
    [200, "Unhealthy", "bad"], [300, "Very unhealthy", "bad"], [Infinity, "Hazardous", "bad"]],
  in: [[50, "Good", "good"], [100, "Satisfactory", "good"], [200, "Moderate", "warn"],
    [300, "Poor", "warn"], [400, "Very poor", "bad"], [Infinity, "Severe", "bad"]],
  eu: [[20, "Good", "good"], [40, "Fair", "good"], [60, "Moderate", "warn"],
    [80, "Poor", "warn"], [100, "Very poor", "bad"], [Infinity, "Extremely poor", "bad"]],
};
const scale = BANDS[options.scale] ? options.scale : "us";
const band = (aqi) => BANDS[scale].find(([top]) => aqi <= top).slice(1);

// India's index (CPCB), which Open-Meteo doesn't give: 24-hour means of PM2.5, PM10, NO₂ and SO₂
// and 8-hour means of CO (in mg/m³) and O₃, each placed between its breakpoints on 0–50–100–200–
// 300–400–500; the highest is the index. The top band is taken as wide as the one under it.
const INDIA = [
  ["pm2_5", 24, 1, [0, 30, 60, 90, 120, 250]],
  ["pm10", 24, 1, [0, 50, 100, 250, 350, 430]],
  ["nitrogen_dioxide", 24, 1, [0, 40, 80, 180, 280, 400]],
  ["sulphur_dioxide", 24, 1, [0, 40, 80, 380, 800, 1600]],
  ["carbon_monoxide", 8, 1000, [0, 1, 2, 10, 17, 34]],
  ["ozone", 8, 1, [0, 50, 100, 168, 208, 748]],
];
const STEPS = [0, 50, 100, 200, 300, 400, 500];
function indiaIndex(hourly) {
  let top = null;
  for (const [name, hours, per, breaks] of INDIA) {
    const values = (hourly[name] || []).slice(-hours).filter((v) => v != null);
    if (values.length === 0) continue;
    const c = values.reduce((a, b) => a + b, 0) / values.length / per;
    const at = [...breaks, 2 * breaks[5] - breaks[4]];
    let i = 1;
    while (i < 6 && c > at[i]) i++;
    const sub = STEPS[i - 1] + ((c - at[i - 1]) * (STEPS[i] - STEPS[i - 1])) / (at[i] - at[i - 1]);
    top = Math.max(top ?? 0, Math.min(sub, 500));
  }
  return top;
}

let place, current, hourly;
try {
  const geo = await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(city)}`
  );
  if (!geo.results || geo.results.length === 0) return fail("No air quality", `No place named '${city}'`);
  place = geo.results[0];
  // The US and European indices come ready made (PM as 24-hour means in the US one); India's is
  // worked out from the last 24 hours.
  const data = await getJson(
    "https://air-quality-api.open-meteo.com/v1/air-quality" +
      `?latitude=${place.latitude}&longitude=${place.longitude}` +
      "&current=us_aqi,european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone&timezone=auto" +
      (scale === "in"
        ? "&hourly=pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,ozone&past_hours=23&forecast_hours=1"
        : "")
  );
  current = data.current;
  hourly = data.hourly;
} catch (e) {
  return fail("No air quality", `${e.message || e}`);
}
const index = scale === "in" ? indiaIndex(hourly || {}) : current?.[scale === "eu" ? "european_aqi" : "us_aqi"];
if (!current || index == null) return fail("No air quality", "Open-Meteo sent no reading");

const aqi = Math.round(index);
const [label, role] = band(aqi);
const where = [place.name, place.country_code].filter(Boolean).join(", ");

// The place is the title; a column of readings under it, padded so the numbers line up (mono keeps
// the terminal font for that). The index in the colour of its band.
const rows = [
  [`${scale.toUpperCase()} AQI`, String(aqi), label],
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

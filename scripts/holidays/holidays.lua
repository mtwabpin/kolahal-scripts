-- @title Public holidays
-- @desc The next public holidays of a country: holidays [code], without one its country option
-- @author Kolahal
-- @version 1.1
-- @command
-- @usage [<country code>]
-- @at 07:00
-- @tags holidays, calendar
-- @requires 0.4.7
-- @option country "" The two-letter country code when you type none: US, GB, DE, FR…
--
-- Talks to: date.nager.at (free, no key). A country is its two-letter code: US, GB, DE, FR… Not
-- every country has its holidays there: India doesn't. `holidays GB` lists the next ones, lined up
-- with how far off each is. With its country option set (`script set holidays country GB`),
-- `holidays` alone is enough, and on a timer it pins the next holiday in the header.

local function trim(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end

-- A failure: what didn't work, in the theme's bad colour, and why under it.
local function fail(what, why) log(fmt.color("bad", what), why) end

local line = trim(argline or "")

-- The default country was saved with --default before it was an option.
local saved = line:match("^%-%-default%s+(%S+)$")
if saved then
  return log(fmt.color("muted", "The default country is an option now: script set holidays country " .. saved:upper()))
end

local code = line
if code == "" then code = trim(options.country or "") end
-- A country saved with --default still counts until the option is set.
if code == "" then code = store.get("country") or "" end
code = code:upper()
if not code:match("^%a%a$") then
  return log(fmt.color("muted", "Usage: holidays <country code>, or script set holidays country <code> to keep one"), "Two letters, as in US, GB, DE or FR")
end

local ok, r = pcall(http.get, "https://date.nager.at/api/v3/NextPublicHolidays/" .. code)
if not ok then return fail("No holidays", "Network error: " .. tostring(r)) end
if r.status == 404 then return fail("No holidays", "date.nager.at doesn't know the country " .. code) end
-- A country it doesn't have holidays for (India, for one) comes back empty.
if r.status == 204 then return fail("No holidays", "date.nager.at has no holidays for " .. code) end
if not r.ok then return fail("No holidays", "date.nager.at answered HTTP " .. tostring(r.status)) end

local okJson, list = pcall(json.decode, r.body or "")
if not okJson or type(list) ~= "table" then return fail("No holidays", "date.nager.at sent something unexpected") end
if #list == 0 then return log(fmt.color("muted", "No holidays ahead for " .. code)) end

local DAY = 86400
-- Local noon: a date compared at noon isn't moved by a daylight-saving change.
local function noon(y, m, d) return os.time({ year = y, month = m, day = d, hour = 12 }) end
local now = os.date("*t")
local today = noon(now.year, now.month, now.day)

local function width(s) return utf8.len(s) or #s end

-- The next few, as rows: the date, the holiday (its English name too when it differs), how far off.
local MAX = 8
local rows, widest = {}, 0
for i, h in ipairs(list) do
  if i > MAX then break end
  local y, m, d = (h.date or ""):match("^(%d+)-(%d+)-(%d+)$")
  if y then
    local t = noon(tonumber(y), tonumber(m), tonumber(d))
    local name = h.localName or h.name or "?"
    if h.name and h.name ~= name then name = name .. " (" .. h.name .. ")" end
    rows[#rows + 1] = { on = os.date("%a %d %b", t), name = name, days = math.floor(os.difftime(t, today) / DAY + 0.5) }
    widest = math.max(widest, width(name))
  end
end

local function inDays(days)
  if days == 0 then return "today" end
  if days == 1 then return "tomorrow" end
  return "in " .. days .. " days"
end

-- Lined up: the name padded to the longest; this week's in the warning colour. mono keeps the
-- terminal font, so the columns hold.
for _, row in ipairs(rows) do
  local text = row.on .. "  " .. row.name .. string.rep(" ", widest - width(row.name)) .. "  " .. inDays(row.days)
  if row.days <= 7 then text = fmt.color("warn", text) end
  log(text, nil, { mono = "1" })
end

if rows[1] then status(rows[1].name .. " " .. inDays(rows[1].days)) else status(nil) end

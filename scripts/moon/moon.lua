-- @title Moon phase
-- @desc Today's moon phase and how much of it is lit; pins it in the header
-- @author Kolahal
-- @version 1.3
-- @command
-- @usage
-- @at 06:00
-- @tags moon, sky
-- @requires 0.4.1
--
-- Worked out on the phone: no network, nothing it needs to be allowed. Type `moon`, or let it run
-- each morning: it logs the phase and pins it in the header (switch its header line off in the
-- script's Access settings if you'd rather not have it there).

local SYNODIC = 29.530588853 -- days from one new moon to the next
local NEW_MOON = 947182440   -- a new moon: 6 January 2000, 18:14 UTC, in seconds since 1970

local age = ((os.time() - NEW_MOON) / 86400) % SYNODIC
local lit = math.floor((1 - math.cos(2 * math.pi * age / SYNODIC)) / 2 * 100 + 0.5)

-- Where each phase ends, in days since the new moon: an eighth of the cycle each.
local PHASES = {
  { 1.85, "🌑", "New moon" },
  { 5.54, "🌒", "Waxing crescent" },
  { 9.23, "🌓", "First quarter" },
  { 12.92, "🌔", "Waxing gibbous" },
  { 16.61, "🌕", "Full moon" },
  { 20.30, "🌖", "Waning gibbous" },
  { 23.99, "🌗", "Last quarter" },
  { 27.68, "🌘", "Waning crescent" },
  { SYNODIC + 1, "🌑", "New moon" },
}

local icon, name
for _, p in ipairs(PHASES) do
  if age < p[1] then
    icon, name = p[2], p[3]
    break
  end
end

local line = string.format("%s %s, %d%% lit", icon, name, lit)
status(line)

-- From Kolahal 0.5.0, big numbers: how much is lit, large, then the moon's age and the next full
-- moon (half a cycle after the new one; "Today" within a day of it). An older Kolahal gets one line.
if fmt.stats then
  local toFull = (SYNODIC / 2 - age) % SYNODIC
  local fullOn = os.time() + math.floor(toFull * 86400)
  local full = (toFull < 1 or toFull > SYNODIC - 1) and "Today" or (tonumber(os.date("%d", fullOn)) .. " " .. os.date("%b", fullOn))
  log(icon .. " " .. name, fmt.stats({ { lit .. "%", "lit" }, { string.format("%.1f", age), "days old" }, { full, "full moon" } }))
else
  log(icon .. " " .. name, fmt.bold(lit .. "%") .. " lit")
end

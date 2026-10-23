-- @title Moon Phase
-- @desc today's moon phase and how much of it is lit; pins it in the header
-- @author Kolahal
-- @version 1.1
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
  { 1.85, "🌑", "new moon" },
  { 5.54, "🌒", "waxing crescent" },
  { 9.23, "🌓", "first quarter" },
  { 12.92, "🌔", "waxing gibbous" },
  { 16.61, "🌕", "full moon" },
  { 20.30, "🌖", "waning gibbous" },
  { 23.99, "🌗", "last quarter" },
  { 27.68, "🌘", "waning crescent" },
  { SYNODIC + 1, "🌑", "new moon" },
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
log(icon .. " " .. name, fmt.bold(lit .. "%") .. " lit")

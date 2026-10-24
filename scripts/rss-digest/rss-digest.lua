-- @title RSS digest
-- @desc New items from several feeds in one run, each line named after its feed
-- @author Kolahal
-- @version 1.2
-- @requires 0.4.1
-- @every 1h
-- @notify
-- @tags feeds, rss, news
--
-- Talks to: the feeds in the FEEDS list below (Lobsters, LWN and Ars Technica to start with).
--
-- Kolahal has a feed reader built in (`feed add <url>`, or the Feeds screen), with read and unread
-- items and OPML. This script is for doing your own thing with feeds: edit the list, filter the
-- items, mix them with other data. Each run logs only items it hasn't seen, at most PER_FEED per
-- feed, and pins "Feeds: N new" in the header.

local FEEDS = {
  { name = "Lobsters", url = "https://lobste.rs/rss" },
  { name = "LWN",      url = "https://lwn.net/headlines/rss" },
  { name = "Ars",      url = "https://feeds.arstechnica.com/arstechnica/index" },
}

local PER_FEED = 5

local total, first = 0, nil

-- The feed's name starts each line, in the accent colour and padded to the longest, so the titles
-- line up; mono keeps the terminal font for that. A title is web text: fmt needs no escaping for it.
local widest = 0
for _, f in ipairs(FEEDS) do widest = math.max(widest, #f.name) end
local function name(f) return fmt.color("accent", f.name .. string.rep(" ", widest - #f.name)) end

for _, f in ipairs(FEEDS) do
  local ok, feed = pcall(rss.fresh, f.url)
  if not ok then
    log(name(f) .. "  " .. fmt.color("bad", "Fetch failed"), tostring(feed), { mono = "1" })
  else
    local items = feed.items or {}
    for i, item in ipairs(items) do
      if i > PER_FEED then
        log(name(f) .. "  " .. fmt.color("muted", "+" .. (#items - PER_FEED) .. " more"), nil, { mono = "1" })
        break
      end
      log(name(f) .. "  " .. (item.title or "(untitled)"), nil, { url = item.link, mono = "1" })
    end
    if #items > 0 and first == nil then
      first = { feed = f.name, item = items[1] }
    end
    total = total + #items
  end
end

if total == 0 then
  status(nil)
  return
end

status("Feeds: " .. total .. " new")
notify("Feeds: " .. total .. " new", "[" .. first.feed .. "] " .. (first.item.title or ""),
  { url = first.item.link })

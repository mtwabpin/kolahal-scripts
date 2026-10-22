-- @title RSS Digest
-- @desc new items from several feeds in one run, each line named after its feed
-- @author Kolahal
-- @version 1.0
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
  { name = "lobsters", url = "https://lobste.rs/rss" },
  { name = "lwn",      url = "https://lwn.net/headlines/rss" },
  { name = "ars",      url = "https://feeds.arstechnica.com/arstechnica/index" },
}

local PER_FEED = 5

local total, first = 0, nil

for _, f in ipairs(FEEDS) do
  local ok, feed = pcall(rss.fresh, f.url)
  if not ok then
    log("[" .. f.name .. "] fetch failed (" .. tostring(feed) .. ")")
  else
    local items = feed.items or {}
    for i, item in ipairs(items) do
      if i > PER_FEED then
        log("[" .. f.name .. "] … " .. (#items - PER_FEED) .. " more")
        break
      end
      log("[" .. f.name .. "] " .. (item.title or "(untitled)"), { url = item.link })
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

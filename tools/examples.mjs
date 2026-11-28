// Sample scripts and shaders, with what rules.mjs says of each: "kolahal" as Kolahal's editor would say it
// (and the phone mode of the website's Script check), "library" what this repository asks for besides. Each
// message is "<line>: <words>", its hints after its first line joined by "\n". tools/rules.test.mjs checks
// them all (`node --test tools/`). When Kolahal's editor changes its words, change them here with rules.mjs.
export const examples = [
  {
    about: 'A clean library script: nothing to say',
    name: 'world-time',
    lang: 'lua',
    code: `-- @title World time
-- @desc The time in Tokyo
-- @author Kolahal
-- @version 1.0
-- @command
log("Tokyo", os.date("!%H:%M", os.time() + 9 * 3600))
`,
    kolahal: [],
    library: [],
  },
  {
    about: 'A widget of a size there is none of, a misspelt directive, and an event that is none',
    name: 'world-clocks',
    lang: 'lua',
    code: `-- @title World clocks
-- @desc Three cities' times
-- @author Kolahal
-- @version 1.3
-- @requires 0.5.8
-- @widget clock 3x2
-- @evrey 1h
-- @on unlok
widget.show{ title = "Tokyo" }
`,
    kolahal: [
      '6: @widget clock 3x2 isn\'t a size: 1x1, 2x1, 2x2, 4x1, 4x2, 4x4',
      '7: Unknown directive @evrey: @every?',
      '8: @on unlok isn\'t an event: unlock, charger, unplug, wifi, offline, notification, boot, headset',
    ],
    library: [],
  },
  {
    about: 'Calls that need a @uses line, a time that is none, and a timer of a screen of its own',
    name: 'inbox',
    lang: 'js',
    code: `// @title Inbox
// @desc Recent notifications
// @author Kolahal
// @version 1.0
// @requires 0.5.17
// @uses screen
// @every 1h
// @at 25:00
const all = notifications.recent();
tty.screen({ start(g) { g.put(0, 0, String(all.length)); } });
`,
    kolahal: [
      '7: @every doesn\'t work with @uses screen: a script that draws a full screen runs only when you start it',
      '8: @at 25:00 isn\'t a time: HH:mm, such as 07:30',
      '8: @at doesn\'t work with @uses screen: a script that draws a full screen runs only when you start it',
      '9: notifications.recent needs a `// @uses notifications` line',
    ],
    library: [],
  },
  {
    about: 'Package names over a comma, as Kolahal reads them: no problem (check.mjs took the second for a mistake)',
    name: 'chat-ping',
    lang: 'lua',
    code: `-- @title Chat ping
-- @desc A line for each message
-- @author Kolahal
-- @version 1.0
-- @requires 0.5.18
-- @uses notifications
-- @on notification com.example.chat, org.example.mail
log(event.app, event.title)
`,
    kolahal: [],
    library: [],
  },
  {
    about: 'A header the library can\'t take, and features of a newer Kolahal than its @requires',
    name: 'Weather',
    lang: 'lua',
    code: `-- @title Weather
-- @version one
-- @requires 0.4.0
-- @option city London The city
-- @secret OWM_KEY api.openweathermap.org
local key = secrets.get("OWM_KEY")
log(fmt.bold(options.city), options.units)
`,
    kolahal: [],
    library: [
      '1: Weather isn\'t a name the library takes\nSmall letters, digits, - and _, at most 40',
      '1: No @desc, @author lines\nThe library needs @title, @desc, @author and @version',
      '2: @version one isn\'t a version: numbers like 1.2',
      '3: It uses fmt, md or logs, so it needs `-- @requires 0.4.1` or newer',
      '3: It has options, so it needs `-- @requires 0.4.7` or newer',
      '5: @secret OWM_KEY needs a few words after the site\nWhat it is and where to get one',
      '7: options.units needs a `@option units <default> <description>` line',
    ],
  },
  {
    about: 'A request that waits longer than 30 seconds, in a script for an older Kolahal: said for the phone too',
    name: 'slow-answer',
    lang: 'js',
    code: `// @title Slow answer
// @desc Asks a slow server
// @author Kolahal
// @version 1.0
const r = await http.request({ url: "https://example.com/slow", method: "POST", timeout: 60 });
log(r.body);
`,
    kolahal: [
      '5: http.request\'s timeout needs `// @requires 0.5.23` or newer\nAn older Kolahal stops a request after 30 s',
    ],
    library: [],
  },
  {
    about: 'A call that isn\'t in the API, when the API\'s names are given (the website has them; check.mjs doesn\'t)',
    name: 'typo',
    lang: 'lua',
    api: { names: ['http', 'http.get', 'http.request', 'log'], namespaces: ['http'] },
    code: `-- @title Typo
-- @desc A misspelt call
-- @author Kolahal
-- @version 1.0
local r = http.gte("https://example.com")
log(r.body)
`,
    kolahal: ['5: http.gte isn\'t in the API: http.get?'],
    library: [],
  },
  {
    about: 'A shader with eight words to choose from and the seed uniform, as Kolahal takes them (check.mjs took two to four, and no seed)',
    name: 'tiles',
    lang: 'agsl',
    code: `// @name Tiles
// @description Tiles in a shape you pick
// @author Kolahal
// @version 1.0
// @license MIT
// @requires 0.5.17
// @param shape a|b|c|d|e|f|g|h = a Shape
uniform shader content;
uniform float2 resolution;
uniform float shape;
uniform float seed;
half4 main(float2 xy) {
  return content.eval(xy) * half4(half(shape / 8.0 + seed * 0.0), 1, 1, 1);
}
`,
    kolahal: [],
    library: [],
  },
  {
    about: 'A shader Kolahal can\'t use, and lines it leaves out',
    name: 'crt',
    lang: 'agsl',
    code: `// @name My CRT
// @fps 90
// @param amount 2.0..1.0 = 1.0 Amount
uniform float time;
uniform float3 resolution;
uniform float glow;
half4 main(float2 xy) { return half4(1); }
`,
    kolahal: [
      '1: it needs \'uniform shader content;\', the surface it draws over',
      '2: \'@fps 90\': write a whole number from 1 to 30',
      '3: \'@param amount 2.0..1.0 = 1.0 Amount\' can\'t be read: write \'@param amount 0.0..2.0 = 1.0 Title\' or \'@param shape a|b = a Title\'',
      '5: \'resolution\' must be a float2, not float3',
    ],
    library: [
      '1: crt comes with Kolahal\nShare it under another name',
      '1: No @description, @author, @version, @license, @requires lines\nThe library needs @name, @description, @author, @version, @license and @requires',
      '4: It reads time, which only moves in a shader with // @animated (or @once)',
      '6: uniform glow: Kolahal doesn\'t set it, so it stays 0\nMake it a const, or a @param',
    ],
  },
];

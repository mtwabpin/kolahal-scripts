# Sharing a script

1. Fork this repository.
2. Add your script as `scripts/<name>/<name>.lua` (or `.js`). The name is the command people type
   to run it: lowercase letters, digits, `-` and `_`, up to 40, and not the name of a Kolahal command.
3. Start it with these lines (`//` instead of `--` in JavaScript):

   ```lua
   -- @title Moon phase
   -- @desc Today's moon phase and how much of it is lit
   -- @author your GitHub name
   -- @version 1.0
   ```

   Then, as it needs them: `@command` and `@usage`, `@every` or `@at` and `@notify`, `@on`, `@uses`,
   `@secret`, `@option`, `@widget`, `@gives`, `@tags`, and `@requires` with the oldest Kolahal it
   works with.
   [Describing a script](https://mtwabpin.github.io/kolahal/scripting/overview/#describing-a-script)
   explains each one. [scripts/moon](scripts/moon/moon.lua) is a small example.
4. Open a pull request against `main`. The check runs on it, and someone reads the code before it is
   merged. By opening one, you share your script under the [MIT license](LICENSE), like everything here.

A script that needs a Kolahal that isn't released yet (its `@requires` is newer than the newest
release) goes to the branch of that version, such as `0.5.17`: open the pull request against it.
It is published from there for that Kolahal, and reaches `main` when that Kolahal is released. A fix
for the scripts of an older Kolahal goes to its branch, and to `main` if `main` has the same script.
The [README](README.md#branches) says what each branch is.

To update a script, change it and raise its `@version`: Kolahal offers the update to everyone who
has it and hasn't edited their copy.

## Sharing a shader

Add it as `shaders/<name>/<name>.agsl`, with the header lines that the
[README](README.md#shaders) shows, and open a pull request. Shaders need Kolahal 0.5.17: until it is
released, open it against the `0.5.17` branch. The name is one word: lowercase letters, digits, `-`
and `_`, up to 40. It can't be a word of the `shader` command (`ls`, `use`, `get`…), the name of
a shader that comes with Kolahal, or start with `template-`. The check asks for:

- One file per folder, named after the folder, of at most 64 KB, with no line longer than 300 characters.
- `@name`, `@description`, `@author`, `@version`, `@license` and `@requires` (0.5.17 or newer) lines.
  `@license` is MIT, like everything here.
- `uniform shader content;` and no other input, and only
  [uniforms that Kolahal sets](https://mtwabpin.github.io/kolahal/scripting/shaders/#uniforms), with their
  types, or a [parameter](https://mtwabpin.github.io/kolahal/scripting/shaders/#parameters)'s `uniform float`.
- `@param` lines that Kolahal can read, at most 8, none named after a uniform that Kolahal sets.
- `@animated` (or `@once`) for one that reads `time`.

It only warns about an `@fps` or `@settles` line that Kolahal can't read, or an `@follow` that names no
value Kolahal has: Kolahal leaves such a line out, and the shader works without it.

It doesn't compile the shader: try it on a phone first (`shader check <name>`), on a dark and a light theme,
and say in the pull request which phone it ran on. A reviewer checks that text stays easy to read, that
nothing moves far from where it is tapped, and that it looks at a few pixels around each one, not hundreds.

## What the check looks for

You can run it yourself with `node tools/check.mjs` (and `luac` for Lua syntax). Each branch has its
own, with the rules of its Kolahal version. `node tools/site.mjs --out <folder> --local` builds the
whole site, a folder for each version branch, as GitHub publishes it.

- One script per folder, named after the folder, and not a Kolahal command's name (Kolahal doesn't
  install such a script).
- Only `@` lines that Kolahal knows: a typo such as `@evrey` fails the check.
- `@title`, `@desc`, `@author` and `@version` lines.
- An `@uses` line for everything that needs one: `apps` for `apps.list()`, `clipboard` for
  `clipboard.get()` and `.set()`, `notifications` for `notifications.recent()` and
  `@on notification`, `commands` for `launcher.run()`, `dnd` for `device.dnd()` and `.setDnd()`,
  `work` for `device.work()` and `.setWork()`, `usage` for `usage.*`, `screen` for `tty.screen()`
  and `effects` for `shader.play()`, as
  [What a script may use](https://mtwabpin.github.io/kolahal/scripting/overview/#what-a-script-may-use) lists them.
- Known `@on` events, and `@every` / `@at` values Kolahal understands. `@on notification` may name
  apps by package, as in `@on notification com.example.chat`, and then needs `@requires 0.5.18` or newer.
- For an API key: `@secret NAME site description` naming the site it is sent to (not `*`), an
  `@secret` line for each name `secrets.get` reads, and `@requires 0.4.0` or newer.
- `@requires 0.4.1` or newer for a script that calls `fmt`, `md` or `logs`, and `@requires 0.4.4`
  or newer for one with `@uses dnd` or `@uses work`.
- `@requires 0.5.20` or newer for a script that calls `web.open()`.
- For a setting (a city, a feed's address, how many lines): `@option name default description`,
  an `@option` line for each name the code reads as `options.name`, and `@requires 0.4.7` or newer.
  [Options](https://mtwabpin.github.io/kolahal/scripting/overview/#options) explains them.
- For a full screen of its own (`@uses screen`): no `@every`, `@at`, `@on` or `@widget`, as it runs
  only when you start it.
- For values that shaders follow: a `@gives` line naming each value that `shader.give` gives, at most 8.
- `@requires 0.5.17` or newer for `@uses screen`, `@uses effects` or `@gives`.
- A `@widget` line names a kind of widget and a size that Kolahal has, such as `@widget stat 2x1`.
  A size the kind isn't made for (`@widget sky 4x4`) is only a warning: Kolahal draws it all the same.
- `@requires 0.5.17` or newer for a `versus` or `sky` widget, a `progress` widget's `gauge`, `rings`
  or `stages`, and a `stat`'s `scene`. A `stat`'s `points` needs it too, though the check can't tell
  them from a chart's.
- No syntax errors, at most 64 KB, and no line longer than 300 characters.

## What a reviewer looks for

- **It does what its description says**, and nothing else.
- **It says where it connects**: name the websites it talks to in a comment at the top, and send
  nothing about the phone or its owner anywhere the description doesn't mention.
- **It can be read**: no minified or obfuscated code, and no code fetched and run at runtime.
- **No secrets in it**: an API key or token is named with an `@secret` line and read with
  `secrets.get`; each person sets their own on the phone
  ([API keys and other secrets](https://mtwabpin.github.io/kolahal/scripting/overview/#api-keys-and-other-secrets)).
- **It asks for little**: `@uses` only what it needs, and timers no more often than they have to be.

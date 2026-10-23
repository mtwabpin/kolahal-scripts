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
   `@secret`, `@tags`, and `@requires` with the oldest Kolahal it works with.
   [Describing a script](https://mtwabpin.github.io/kolahal/scripting/overview/#describing-a-script)
   explains each one. [scripts/moon](scripts/moon/moon.lua) is a small example.
4. Open a pull request. The check runs on it, and someone reads the code before it is merged.
   By opening one, you share your script under the [MIT license](LICENSE), like everything here.

To update a script, change it and raise its `@version`: Kolahal offers the update to everyone who
has it and hasn't edited their copy.

## What the check looks for

You can run it yourself with `node tools/check.mjs` (and `luac` for Lua syntax).

- One script per folder, named after the folder.
- `@title`, `@desc`, `@author` and `@version` lines.
- An `@uses` line for everything that needs one: `apps` for `apps.list()`, `clipboard` for
  `clipboard.get()` and `.set()`, `notifications` for `notifications.recent()` and
  `@on notification`, `commands` for `launcher.run()`, and `lan` for requests to this phone or the
  local network.
- Known `@on` events, and `@every` / `@at` values Kolahal understands.
- For an API key: `@secret NAME site description` naming the site it is sent to (not `*`), an
  `@secret` line for each name `secrets.get` reads, and `@requires 0.4.0` or newer.
- `@requires 0.4.1` or newer for a script that calls `fmt`, `md` or `logs`.
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

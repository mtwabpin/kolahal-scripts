# Kolahal scripts

Scripts for [Kolahal](https://github.com/mtwabpin/kolahal), the keyboard-first terminal launcher for
Android, shared by the people who use it. Each one is a single Lua or JavaScript file that runs in
Kolahal's script sandbox: on a timer, when something happens on the phone, or as a command you type.

## Getting a script

- **In Kolahal**: Scripts → Get more scripts lists everything here, with what each script uses, and
  installs it.
- **Or by hand**: download a script's file, then Scripts → Import (the ⬆ at the top).

A script you add arrives switched off. Switching it on shows what it asks to use (your apps, your
notifications, the clipboard, your local network, running commands), and you can switch any of it
off, then or later.

## What's here

- `scripts/<name>/<name>.lua` or `.js`: one folder per script. The script's name is the command you
  type to run it.
- Each script describes itself in its first lines: `@title`, `@desc`, `@author`, `@version`, and
  what it uses and when it runs. [Describing a script](https://mtwabpin.github.io/kolahal/scripting/overview/#describing-a-script)
  lists them all.
- Scripts named `template-…` are starting points: short, commented scripts that show one way of
  working each. `template-command` (a command you type), `template-timer` (runs by itself and
  tells you what changed), `template-api-key` (an API key you set on the phone), `template-event`
  (runs when something happens on the phone) and `template-js` (the same in JavaScript).
- `index.json`, published at https://mtwabpin.github.io/kolahal-scripts/index.json, lists every
  script with its checksum. Kolahal reads it, and checks each file against it before installing.

## Sharing a script

See [CONTRIBUTING.md](CONTRIBUTING.md): add your script in its own folder and open a pull request.
Every pull request is checked automatically, then read by a person before it is merged.

To write one, start with the [scripting guide](https://mtwabpin.github.io/kolahal/scripting/overview/)
and the [API](https://mtwabpin.github.io/kolahal/scripting/api/).

## License

Every script here is shared under the [MIT license](LICENSE).

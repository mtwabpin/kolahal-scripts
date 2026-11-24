# Kolahal scripts

Scripts for [Kolahal](https://github.com/mtwabpin/kolahal), the keyboard-first terminal launcher for
Android, shared by the people who use it. Each one is a single Lua or JavaScript file that runs in
Kolahal's script sandbox: on a timer, when something happens on the phone, or as a command you type.

## Getting a script

- **In Kolahal**: Scripts → Get more scripts lists everything here, with what each script uses, and
  installs it.
- **Or by hand**: download a script's file, then Scripts → Import (the ⬆ at the top).

A script you add arrives switched off. Switching it on shows what it asks to use (your apps, your
notifications, the clipboard, running commands), and you can switch any of it
off, then or later.

## What's here

- `scripts/<name>/<name>.lua` or `.js`: one folder per script. The script's name is the command you
  type to run it.
- Each script describes itself in its first lines: `@title`, `@desc`, `@author`, `@version`, and
  what it uses and when it runs. [Describing a script](https://mtwabpin.github.io/kolahal/scripting/overview/#describing-a-script)
  lists them all.
- Scripts named `template-…` are starting points: short, commented scripts that show one way of
  working each: a command you type, a timer, an event on the phone, an API key, a fetch, every kind
  of log line, two widgets, and a full screen of its own (`template-screen`, Kolahal 0.5.17). Each
  comes in Lua and in JavaScript (`-js`).
- Kolahal's own library is here too: the 57 ready-made scripts that come with the app, such as
  `weather`, `hn`, `countdown` and `habit`, by Kolahal. They are the same files as in the app's
  **Add script → From the library**, and are updated here when the app's are. Those named `tty-…`,
  such as `tty-matrix`, draw a full screen as Kolahal's own screens do (Kolahal 0.5.17).
- `index.json`, published at https://mtwabpin.github.io/kolahal-scripts/index.json, lists every
  script with its checksum. Kolahal reads it, and checks each file against it before installing.

## Branches

- `main` holds the scripts for the newest Kolahal that is released. Its list is the one above, which
  Kolahal reads when there is no list for its own version. Kolahal 0.5.16 and older read only this one.
- A branch named after a Kolahal version, such as `0.5.17`, holds the scripts for that version. Its
  list is published as `https://mtwabpin.github.io/kolahal-scripts/0.5.17/index.json`, with its
  scripts beside it, and that Kolahal reads it first.
- Scripts for the next Kolahal go on its branch at once, so they are published before it is released.
  What is merged into `main` meanwhile is merged into that branch too, so its list has it as well.
  The branch is merged into `main` when that Kolahal is released, and stays, for fixes to the scripts
  of that version.

## Keeping your own scripts

You can also keep scripts in a repository of your own, and add and update them whenever you like:
nobody needs to merge them here. Start from
[kolahal-scripts-template](https://github.com/mtwabpin/kolahal-scripts-template) (**Use this template**):
it has the same checks and publishes its own list. Then add it in Kolahal under
**Scripts → Get more scripts → Sources** (Kolahal 0.5.15 or newer).

## Sharing a script

See [CONTRIBUTING.md](CONTRIBUTING.md): add your script in its own folder and open a pull request.
Every pull request is checked automatically, then read by a person before it is merged.

To write one, start with the [scripting guide](https://mtwabpin.github.io/kolahal/scripting/overview/)
and the [API](https://mtwabpin.github.io/kolahal/scripting/api/).

## License

Every script here is shared under the [MIT license](LICENSE).

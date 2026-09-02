# wardogs-mcp

An MCP server that lets Claude build FOB layouts in the
[wardogs.zone base builder](https://wardogs.zone/loadouts/base) from a plain text brief.

The builder stores a base as a single text string in the browser's draft slot. This
server does the geometry (socket pitch, stacking, rings, validation), writes that string
into its own Chromium window and reloads the builder so it renders. Other players' hub
bases load the same way and can be edited.

## Install

There are two routes. Both come from this repo, and both can be installed on one machine.

### A. Claude Desktop only, without Node or git

1. Download `wardogs-mcp.mcpb` from the
   [latest release](https://github.com/MudcrabWarrior/wardogs-mcp/releases/latest).
2. Double-click the file. Claude Desktop shows an install prompt; click Install.
3. Download [CLAUDE.md](CLAUDE.md) as well and paste it into a Claude project's
   instructions so Desktop has the base-building rules.

The bundle keeps its plans, screenshots and browser profile in `Documents\wardogs-mcp`,
and downloads Chromium on the first `browser_open` (a few hundred MB, once).

### B. Claude Code, or Claude Desktop from the same folder

Paste this into Claude Code:

    Set up https://github.com/MudcrabWarrior/wardogs-mcp for me. Follow SETUP.md.

Claude clones the repo, runs `npm run setup`, registers the server for Claude Code and
Claude Desktop, and walks through the one-time Discord sign-in. Node.js 20 or newer and
git are required. Full steps are in [SETUP.md](SETUP.md).

Manually:

    git clone https://github.com/MudcrabWarrior/wardogs-mcp.git
    cd wardogs-mcp
    npm run setup

`npm run setup` also fetches the piece dataset from wardogs.zone, so it needs the network
once. The dataset is not tracked in the repo.

For Claude Code that is all: `.mcp.json` registers the server whenever Claude Code runs
from this folder. For Claude Desktop, open Settings > Developer > Edit Config, add the
entry below inside `"mcpServers"` using the real absolute path of the folder, then fully
quit and restart Desktop:

    "wardogs": {
      "command": "node",
      "args": ["C:\\path\\to\\wardogs-mcp\\dist\\server.js"]
    }

Installing both routes makes Desktop list two wardogs servers. Disable one under
Settings > Extensions or remove the config entry; keeping both is harmless, but Claude
receives duplicate tools.

## Usage

Describe the base you want:

    New base. FOB at centre. Hesco small ring 14 m out with a gate on the south side.
    Mortar pit north-east inside the ring, two mortars. Stack the ring two high on the
    north side only. Keep supplies under 900. Push it and screenshot from camera 2.

Units are metres on the flat pad, and yaw is in degrees. In `ring()`, north is -z, south
is +z, east is +x and west is -x. Every piece must sit inside a FOB's 60 m square.

[CLAUDE.md](CLAUDE.md) holds the standing base-building rules that Claude applies to
every plan: site limits, player movement facts, fortification principles and builder
quirks. `plans/` holds a worked example, loaded with `plan_load vauban-mega-v1`.

### Hub sign-in and publishing

1. Ask Claude to run `browser_open`.
2. In the Chromium window that appears, click Sign in (Discord) and complete it yourself.
3. The session is kept in `.profile` (or `Documents\wardogs-mcp\.profile` for the bundle).
4. `hub_save` fills the save dialog. You complete any captcha and click Save.

Nothing types credentials on your behalf, and nothing outside `.profile` stores them.
Building and screenshotting bases do not require sign-in.

## Tools

- **Plan**: `plan_new`, `plan_status`, `plan_pieces`, `plan_code`, `plan_load_code`,
  `plan_save`, `plan_load`, `plan_list`, `undo`, `redo`
- **Edit**: `place_fob`, `place`, `wall_run`, `ring`, `stack`, `move`, `set_pose`,
  `remove`, `remove_all`
- **Browser**: `browser_open`, `browser_push`, `browser_pull`, `browser_readback`,
  `browser_screenshot`, `browser_key`, `browser_close`
- **Hub**: `hub_import`, `hub_save`
- **Data**: `list_buildables`, `describe_buildable`, `data_refresh`

## Development

    npm run dev        run from source with tsx
    npm test           unit tests for the codec and geometry
    npm run extract    fetch data/buildables.json from the site
    npm run build      compile to dist/
    npm run bundle     build the .mcpb

Layout:

    src/data.ts     extract and cache the piece dataset
    src/plan.ts     codec, snapping, stats, validation (ports of the site's functions)
    src/editor.ts   working plan, wall runs, rings, stacking, undo
    src/browser.ts  Playwright control of the builder
    src/server.ts   MCP tools
    scripts/        dataset extract and .mcpb bundle build
    plans/          saved plans and screenshots

Set `WARDOGS_HOME` to move the writable folders (dataset cache, plans, `.profile`) out of
the package folder. The bundle sets it automatically.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the pull request process.

## Known limits

- Open pad only. Map sites (Kavkazi, Europe, North America) need terrain heights and are
  not wired up yet.
- Overlap checks use whole-piece boxes, while the site checks per mesh. A mortar inside a
  bunker is valid on the site but reports as an overlap here. Treat overlap as a warning
  and trust the builder's own status line after `browser_push`.
- Plans loaded through the draft slot skip the site's placement checks, so an invalid
  plan still renders. `plan_status` is the guard.
- Which compass direction is "up" on the builder's screen has not been confirmed. Take a
  screenshot after the first push and adjust yaw if the layout is mirrored.

## Licence

MIT. See [LICENSE](LICENSE).

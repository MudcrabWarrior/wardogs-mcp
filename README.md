# wardogs-mcp

An MCP server that lets an AI assistant build FOB layouts in the
[wardogs.zone base builder](https://wardogs.zone/loadouts/base) from a plain text brief.

The builder stores a base as a single text string in the browser's draft slot. This
server does the geometry (socket pitch, stacking, rings, validation), writes that string
into its own Chromium window and reloads the builder so it renders. Other players' hub
bases load the same way and can be edited.

It speaks plain [MCP](https://modelcontextprotocol.io) over stdio, so it works with any
MCP client: Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, Zed, Cline, Gemini
CLI, Goose and others.

## Install

### Any MCP client, via npx

No clone and no build. Add this to your client's MCP config:

```json
{
  "mcpServers": {
    "wardogs": {
      "command": "npx",
      "args": ["-y", "wardogs-mcp"]
    }
  }
}
```

Where that config lives depends on the client:

| Client | Config file |
| --- | --- |
| Claude Code | `.mcp.json` in the project folder, or `claude mcp add` |
| Claude Desktop | Settings > Developer > Edit Config |
| Cursor | `.cursor/mcp.json` |
| VS Code | `.vscode/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Zed | `settings.json`, under `context_servers` |
| Cline | `cline_mcp_settings.json` |
| Gemini CLI | `~/.gemini/settings.json` |

Some clients nest the same block under a different key (`servers` in VS Code,
`context_servers` in Zed). The `command` and `args` are the same everywhere.

Plans, screenshots, the dataset cache and the browser profile go in `wardogs-mcp` in your
home folder. Set `WARDOGS_HOME` to move them.

### Claude Desktop, one click

Download `wardogs-mcp.mcpb` from the
[latest release](https://github.com/MudcrabWarrior/wardogs-mcp/releases/latest) and
double-click it. Claude Desktop shows an install prompt; click Install. This route needs
no Node.js.

### From source

    git clone https://github.com/MudcrabWarrior/wardogs-mcp.git
    cd wardogs-mcp
    npm run setup

Node.js 20 or newer. `npm run setup` installs dependencies, downloads the Chromium build
Playwright drives, fetches the piece dataset from wardogs.zone and compiles `dist/`. It
needs the network once; the dataset is not tracked in the repo.

Point your client at the built server, using the real absolute path:

```json
{
  "mcpServers": {
    "wardogs": {
      "command": "node",
      "args": ["C:\\path\\to\\wardogs-mcp\\dist\\server.js"]
    }
  }
}
```

Claude Code needs no config from source: `.mcp.json` in the folder registers the server
when Claude Code runs from there. Full steps are in [SETUP.md](SETUP.md).

## Usage

Describe the base you want:

    New base. FOB at centre. Hesco small ring 14 m out with a gate on the south side.
    Mortar pit north-east inside the ring, two mortars. Stack the ring two high on the
    north side only. Keep supplies under 900. Push it and screenshot from camera 2.

Units are metres on the flat pad, and yaw is in degrees. In `ring()`, north is -z, south
is +z, east is +x and west is -x. Every piece must sit inside a FOB's 60 m square.

### The ruleset

Good bases need more than geometry: vault heights, standoff distances, where bastions go,
which builder quirks to work around. That ruleset is served over the protocol by the
`rules` tool, so every client gets it without any per-client setup. Assistants are told to
call `rules` before planning a base; if yours does not, ask it to.

The same text is also exposed as the resource `wardogs://rules` for clients that support
resources, and lives in [AGENTS.md](AGENTS.md) for clients that read a rules file from the
project folder.

`plans/` holds a worked example, loaded with `plan_load vauban-mega-v1`.

### Hub sign-in and publishing

1. Ask for `browser_open`.
2. In the Chromium window that appears, click Sign in (Discord) and complete it yourself.
3. The session is kept in `.profile` inside the writable home folder.
4. `hub_save` fills the save dialog. You complete any captcha and click Save.

Nothing types credentials on your behalf, and nothing outside `.profile` stores them.
Building and screenshotting bases do not require sign-in.

## Tools

- **Rules**: `rules`
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

Set `WARDOGS_HOME` to move the writable folders (dataset cache, plans, `.profile`). A git
checkout keeps them in the package folder; an installed copy uses your home folder.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the pull request process.

## Known limits

- **Local clients only.** The server drives a real Chromium on your machine and keeps a
  browser profile on disk. Hosted and remote setups (web chat connectors, server-side MCP)
  cannot run it.
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

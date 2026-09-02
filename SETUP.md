# Setup instructions (for your AI assistant)

This file covers installing from a git checkout. Two shorter routes exist and may suit
the user better:

- Any MCP client, no clone: put `npx -y wardogs-mcp` in the client's MCP config. See the
  README for the config file each client uses.
- Claude Desktop, no Node.js: download `wardogs-mcp.mcpb` from
  https://github.com/MudcrabWarrior/wardogs-mcp/releases/latest and double-click it.

Use the steps below when the user wants the source, for development, or to run an
unreleased version. The routes can coexist on one machine.

If a person has pasted this repo link and asked you to "set this up", follow these steps
in order. Do not skip the verification at the end. Windows is the expected platform; the
same commands work on macOS and Linux with forward slashes.

## 1. Check prerequisites

- Node.js 20 or newer: run `node --version`. If it is missing or older, tell the user to
  install the LTS build from https://nodejs.org and re-run you afterwards.
- Git: run `git --version`.

## 2. Clone and install

Pick a folder the user will keep, for example `%USERPROFILE%\wardogs-mcp`.

    git clone https://github.com/MudcrabWarrior/wardogs-mcp.git
    cd wardogs-mcp
    npm run setup

`npm run setup` installs dependencies, downloads the Chromium build that Playwright
drives (a few hundred MB, stored in the user's Playwright cache, not in this folder),
fetches the piece dataset from wardogs.zone into `data/buildables.json` and compiles
`dist/server.js`. It needs the network once. The dataset is not tracked in the repo, so
this fetch is required on a fresh clone.

Verify: `npm test` prints `# fail 0` and `dist\server.js` exists.

## 3. Register the server

Claude Code: nothing to do. `.mcp.json` in this folder registers the server whenever
Claude Code is started from inside the folder. Tell the user to run `claude` from this
folder (or add the folder to their Claude Code project list).

Any other MCP client (Claude Desktop, Cursor, VS Code, Windsurf, Zed, Cline, Gemini CLI):
add the entry below inside `"mcpServers"` in that client's config file, replacing the path
with the real absolute path of this folder. Escape backslashes. The README lists where
each client keeps its config.

Claude Desktop keeps its config at:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

    "wardogs": {
      "command": "node",
      "args": ["C:\\Users\\NAME\\wardogs-mcp\\dist\\server.js"]
    }

If the file does not exist, create it with `{ "mcpServers": { ...that entry... } }`.
Then fully quit Claude Desktop (tray icon > Quit) and start it again.

## 4. First run: Discord sign-in (only needed for publishing to the hub)

1. Ask Claude to run the `browser_open` tool. A Chromium window opens on wardogs.zone.
2. The user clicks Sign in (Discord) in that window and finishes it themselves.
3. The session is kept in `.profile/` inside this folder. Nothing types credentials on the
   user's behalf and nothing outside `.profile/` stores them. `.profile/` is gitignored.

Building and screenshotting bases does not need sign-in.

## 5. Verify

Ask Claude (in Claude Code or Claude Desktop) to run `plan_new` and then `list_buildables`.
If the buildables list comes back, the server is working. Then run `browser_open` and
confirm a Chromium window with the base builder appears.

## Standing rules

The base-building rules (site limits, player movement facts, Vauban-style fortification
principles, builder quirks) are served by the `rules` tool, so no per-client setup is
needed. Ask the assistant to call `rules` before it plans a base. The same text is exposed
as the resource `wardogs://rules`; the source file is `AGENTS.md` in this folder.

## Troubleshooting

- "Chromium is not installed": run `npx playwright install chromium` in this folder.
- Server not showing in Claude Desktop: check the JSON is valid (no trailing commas), the
  path is absolute with doubled backslashes, and the app was fully quit, not just closed.
- Tools time out on `browser_open`: the builder waits for the word MANIFEST on the page.
  Check the window opened and wardogs.zone loaded; a slow connection can exceed 30 s.
- Piece data looks stale: run `npm run extract` to refresh `data/buildables.json`.

# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-09-02

### Fixed

- Package description no longer names a single assistant, matching the rest of the 0.2.0
  move to any MCP client. Metadata is fixed per published version, so this needed a
  release of its own.

## [0.2.0] - 2026-09-02

Works with any MCP client, not just Claude.

### Added

- `rules` tool and `wardogs://rules` resource, serving the base-building ruleset over the
  protocol so every client gets it without per-client setup.
- Published to npm, so any MCP client can run the server with `npx -y wardogs-mcp`.
- README config table covering Claude Code, Claude Desktop, Cursor, VS Code, Windsurf,
  Zed, Cline and Gemini CLI.

### Changed

- `CLAUDE.md` is now `AGENTS.md`, the cross-vendor rules filename. The file is no longer
  the delivery mechanism; the `rules` tool is.
- An installed copy (npm, npx) keeps its plans, dataset cache and browser profile in
  `wardogs-mcp` in the user's home folder instead of inside `node_modules`, which npx
  discards between runs. A git checkout is unchanged, and `WARDOGS_HOME` still overrides.

## [0.1.0] - 2026-09-02

First public release.

### Added

- MCP server driving the wardogs.zone base builder through Playwright, with plan,
  edit, browser, hub and dataset tool groups.
- Geometry and codec ported from the site's own functions: socket snapping, wall runs,
  rings, stacking, supply and piece-count stats, and plan validation.
- `perimeter_check` and `plan_status` for finding unjoined wall pieces and overlaps
  before a plan is pushed to the builder.
- Piece dataset extraction from wardogs.zone with an on-disk cache, refreshed by
  `npm run extract` or the `data_refresh` tool.
- `.mcpb` bundle for Claude Desktop, built by `npm run bundle` and attached to releases
  by the `release` workflow.
- Base-building ruleset and a worked example plan in `plans/`.

[0.2.1]: https://github.com/MudcrabWarrior/wardogs-mcp/releases/tag/v0.2.1
[0.2.0]: https://github.com/MudcrabWarrior/wardogs-mcp/releases/tag/v0.2.0
[0.1.0]: https://github.com/MudcrabWarrior/wardogs-mcp/releases/tag/v0.1.0

# Changelog

All notable changes to this project are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- `CLAUDE.md` base-building ruleset and a worked example plan in `plans/`.

[0.1.0]: https://github.com/MudcrabWarrior/wardogs-mcp/releases/tag/v0.1.0

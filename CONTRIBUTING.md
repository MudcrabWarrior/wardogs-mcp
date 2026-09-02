# Contributing

Patches are welcome. The project is small, so there is no formal process beyond the
steps below.

## Getting set up

Node.js 20 or newer is required.

    git clone https://github.com/MudcrabWarrior/wardogs-mcp.git
    cd wardogs-mcp
    npm run setup

`npm run setup` installs dependencies, downloads the Chromium build Playwright drives,
fetches the piece dataset from wardogs.zone and compiles `dist/`. It needs the network
once. The dataset is not tracked in the repo.

## Working on the code

    npm run dev        run the server from source with tsx
    npm test           unit tests for the codec and geometry
    npm run build      compile to dist/
    npm run extract    refresh data/buildables.json from the site
    npm run bundle     build release/wardogs-mcp.mcpb

Run `npm test` and `npm run build` before opening a pull request. The geometry and codec
in `src/plan.ts` are ports of the site's own functions, so any change there should come
with a test that pins the behaviour.

Source is TypeScript with 2-space indentation, LF line endings and UTF-8, as set out in
`.editorconfig`.

## Pull requests

1. Branch from `main`.
2. Keep the change focused, and describe what you tested in the description.
3. Note in the description if the change alters the on-disk plan format or the tool
   surface, since both affect existing saved plans.

Tagging a `v*` tag on `main` triggers the release workflow, which builds the `.mcpb`
bundle and attaches it to a GitHub Release.

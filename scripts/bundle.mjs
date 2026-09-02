// Build release/wardogs-mcp.mcpb: a desktop-app bundle with the compiled server and
// production node_modules. The piece dataset is not bundled (the site's data is not
// redistributed); the first run fetches it. Run with: npm run bundle
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const release = path.join(root, "release");
const stage = path.join(release, "stage");
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit" });

run("npm run build");
rmSync(release, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

for (const f of ["dist", "package.json", "package-lock.json", "README.md", "AGENTS.md", "LICENSE"]) {
  const src = path.join(root, f);
  if (!existsSync(src)) continue;
  cpSync(src, path.join(stage, f), {
    recursive: true,
    filter: (p) => !p.endsWith(".png") && !p.endsWith(".map"),
  });
}
run("npm ci --omit=dev --ignore-scripts --no-audit --no-fund", stage);
rmSync(path.join(stage, "package-lock.json"), { force: true });

const manifest = {
  manifest_version: "0.3",
  name: "wardogs-mcp",
  display_name: "WARDOGS base builder",
  version: pkg.version,
  description: "Lets an AI assistant build FOB layouts in the wardogs.zone base builder from a text brief.",
  long_description: readFileSync(path.join(root, "README.md"), "utf8").split("\n## Tools")[0],
  author: { name: "MudcrabWarrior" },
  repository: { type: "git", url: "https://github.com/MudcrabWarrior/wardogs-mcp" },
  license: "MIT",
  keywords: ["wardogs", "fob", "base-builder", "playwright"],
  server: {
    type: "node",
    entry_point: "dist/server.js",
    mcp_config: {
      command: "node",
      args: ["${__dirname}/dist/server.js"],
      env: {
        WARDOGS_HOME: "${DOCUMENTS}/wardogs-mcp",
      },
    },
  },
  tools: [
    { name: "plan_new", description: "Start an empty plan" },
    { name: "plan_status", description: "Validate the plan: bounds, overlaps, snapping, supplies" },
    { name: "plan_pieces", description: "List pieces in the plan" },
    { name: "plan_code", description: "Export the builder code string" },
    { name: "plan_load_code", description: "Load a builder code string" },
    { name: "plan_save", description: "Save the plan to plans/<name>.json" },
    { name: "plan_load", description: "Load a saved plan" },
    { name: "plan_list", description: "List saved plans" },
    { name: "undo", description: "Undo the last edit" },
    { name: "redo", description: "Redo the last undone edit" },
    { name: "place_fob", description: "Place the FOB" },
    { name: "place", description: "Place a piece at x,z with yaw, snapped to the nearest socket" },
    { name: "wall_run", description: "Lay a straight run of wall pieces between two points" },
    { name: "ring", description: "Lay a square ring of wall pieces around a centre" },
    { name: "stack", description: "Stack pieces on top of others" },
    { name: "move", description: "Move pieces" },
    { name: "set_pose", description: "Set a piece's exact position and yaw" },
    { name: "remove", description: "Remove pieces" },
    { name: "remove_all", description: "Clear the plan" },
    { name: "perimeter_check", description: "Report wall pieces with more than two open sockets" },
    { name: "browser_open", description: "Open the builder in a Chromium window" },
    { name: "browser_push", description: "Render the plan in the builder" },
    { name: "browser_pull", description: "Read the builder's draft back into the plan" },
    { name: "browser_readback", description: "Read supplies, piece count and status from the builder" },
    { name: "browser_screenshot", description: "Screenshot the builder" },
    { name: "browser_key", description: "Press a builder hotkey (camera 1-4, F to frame)" },
    { name: "browser_close", description: "Close the browser window" },
    { name: "hub_import", description: "Load a hub base into the builder" },
    { name: "hub_save", description: "Open the hub save dialog with the plan filled in" },
    { name: "list_buildables", description: "List buildable pieces" },
    { name: "describe_buildable", description: "Show a piece's cost, size and sockets" },
    { name: "data_refresh", description: "Refresh the piece dataset from wardogs.zone" },
  ],
  compatibility: {
    claude_desktop: ">=0.10.0",
    platforms: ["win32", "darwin", "linux"],
    runtimes: { node: ">=20.0.0" },
  },
};
writeFileSync(path.join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const out = path.join(release, "wardogs-mcp.mcpb");
run(`npx mcpb validate "${path.join(stage, "manifest.json")}"`);
run(`npx mcpb pack "${stage}" "${out}"`);
run(`npx mcpb info "${out}"`);
console.log(`\nbundle: ${out}`);

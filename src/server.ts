#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { Catalog, loadDataset, PLANS_DIR, RULES_FILE } from "./data.js";
import { Editor } from "./editor.js";
import { Builder } from "./browser.js";
import { deg, snapKind, yawFromQuat } from "./math.js";
import { createRequire } from "node:module";

// One source of truth for the version. dist/server.js sits one level under the package
// root in a checkout, an npm install and the .mcpb alike, so this resolves in all three.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const json = (o: unknown) => text(JSON.stringify(o, null, 2));
const slug = (s: string) => s.trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "plan";

async function main() {
  const cat = new Catalog(await loadDataset());
  const ed = new Editor(cat);
  const browser = new Builder();

  const server = new McpServer(
    { name: "wardogs-mcp", version },
    {
      instructions: [
        "Drives the wardogs.zone FOB base builder. Units are metres on a flat pad, y up. Yaw is degrees.",
        "Axes: +x and +z are the builder's ground axes; north/south/east/west in ring() mean -z/+z/+x/-x.",
        "Typical flow: plan_new, place_fob, then wall_run / ring / place, plan_status to check issues, browser_push to render, browser_screenshot to look.",
        "Every piece must sit inside a FOB's 60 m square (120 m across).",
        "Snapping is always on: place() lands on the nearest socket, wall_run and ring use socket pitch, plan_status lists any wall piece not joined to a neighbour. Only pass snap=false for deliberately free-standing pieces (mortars, vehicles, tents).",
        "Publishing goes through hub_save which opens the site's own dialog; the user clicks Save.",
        "Call the rules tool before planning a base. It returns the standing base-building ruleset (site limits, player movement facts, fortification principles, builder quirks) that every plan is expected to follow.",
      ].join("\n"),
    },
  );

  // ----- ruleset -----

  // Served over the protocol rather than left as a file for the client to find, so every
  // MCP client gets the same rules. Tools are the one capability every client supports;
  // the resource is a convenience for those that also support resources.
  const rules = () => readFile(RULES_FILE, "utf8");

  server.registerTool(
    "rules",
    { description: "The standing WARDOGS base-building ruleset: site limits, player movement facts, firing positions, fortification principles, walls and layers, gates, emplacements and builder quirks. Read this before planning a base.", inputSchema: {} },
    async () => text(await rules()),
  );

  server.registerResource(
    "rules",
    "wardogs://rules",
    { description: "The standing WARDOGS base-building ruleset.", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: await rules() }] }),
  );

  // ----- catalogue -----

  server.registerTool(
    "list_buildables",
    { description: "List placeable pieces with id, cost, hp, c4, stack limit and footprint. Filter by kind: core, fortification, defence, support, vehicle, structure.", inputSchema: { kind: z.string().optional() } },
    async ({ kind }) =>
      text(
        cat
          .list(kind)
          .map((b) => {
            const [fx, fz] = cat.footprint(b);
            const h = b.box ? b.box.max[1] - Math.min(0, b.box.min[1]) : 0;
            return `${b.id}\t${b.label}\t${b.kind}\t${b.cash ? `$${b.cash}` : `${b.cost} sup`}\t${b.health} hp${b.c4 ? ` · ${b.c4} C4` : ""}${b.maxStack ? ` · stacks ${b.maxStack}` : ""}\t${fx.toFixed(1)}x${fz.toFixed(1)}x${h.toFixed(1)} m\tsockets ${b.snaps.length}`;
          })
          .join("\n"),
      ),
  );

  server.registerTool(
    "describe_buildable",
    { description: "Full data for one piece: boxes, socket positions and kinds. Accepts id, label or a loose name like 'hesco small'.", inputSchema: { piece: z.string() } },
    async ({ piece }) => {
      const b = cat.resolve(piece);
      if (!b) return text(`No match for "${piece}"`);
      return json({ ...b, snaps: b.snaps.map((s) => ({ pos: s.pos, kind: snapKind(s.quat), yawDeg: Math.round(deg(yawFromQuat(s.quat))) })) });
    },
  );

  server.registerTool("data_refresh", { description: "Re-extract the buildables dataset from wardogs.zone (cached 7 days otherwise)." }, async () => {
    const ds = await loadDataset({ refresh: true });
    return text(`Refreshed: ${ds.buildables.length} buildables from ${ds.source} at ${ds.fetchedAt}`);
  });

  // ----- plan state -----

  server.registerTool("plan_new", { description: "Start an empty plan. world is null for the open pad (v1 only supports the open pad).", inputSchema: { world: z.string().nullable().optional() } }, async ({ world }) => {
    ed.reset(world ?? null);
    return text("New empty plan. Place a FOB first (place_fob).");
  });

  server.registerTool("plan_status", { description: "Summary, supply cost, breakdown and validation issues for the current plan." }, async () => {
    const issues = ed.validate();
    const lines = [ed.summary()];
    lines.push(issues.length ? `issues (${issues.length}):` : "issues: none");
    for (const i of issues.slice(0, 60)) lines.push(`  ${i.reason}\t${i.key} ${i.id}\t${i.detail}`);
    if (issues.length > 60) lines.push(`  ... ${issues.length - 60} more`);
    const loose = ed.floating();
    lines.push(loose.length ? `not socket-joined to anything (${loose.length}): ${loose.slice(0, 30).map((l) => `${l.key} ${l.id}`).join(", ")}` : "snapping: every wall piece shares a socket with a neighbour");
    return text(lines.join("\n"));
  });

  server.registerTool("plan_pieces", { description: "List pieces with key, position and yaw. Optional filter by id or label substring.", inputSchema: { filter: z.string().optional() } }, async ({ filter }) => {
    const rows = ed.listPieces(filter);
    return text(rows.length ? rows.join("\n") : "no pieces");
  });

  server.registerTool("plan_code", { description: "The plan as the site's share string. Paste-able into the builder's draft or another tool." }, async () => text(ed.code()));

  server.registerTool("plan_load_code", { description: "Replace the current plan with a site plan string (from plan_code, hub_import or the browser).", inputSchema: { code: z.string() } }, async ({ code }) => {
    ed.loadCode(code);
    return text(ed.summary());
  });

  server.registerTool("plan_save", { description: "Save the current plan to plans/<name>.json in the project folder.", inputSchema: { name: z.string(), notes: z.string().optional() } }, async ({ name, notes }) => {
    await mkdir(PLANS_DIR, { recursive: true });
    const file = path.join(PLANS_DIR, `${slug(name)}.json`);
    await writeFile(file, JSON.stringify({ name, notes: notes ?? "", savedAt: new Date().toISOString(), code: ed.code(), stats: ed.stats() }, null, 2));
    return text(`Saved ${file}`);
  });

  server.registerTool("plan_load", { description: "Load a plan saved with plan_save.", inputSchema: { name: z.string() } }, async ({ name }) => {
    const file = path.join(PLANS_DIR, `${slug(name)}.json`);
    const j = JSON.parse(await readFile(file, "utf8"));
    ed.loadCode(j.code);
    return text(`Loaded ${j.name}${j.notes ? ` (${j.notes})` : ""}\n${ed.summary()}`);
  });

  server.registerTool("plan_list", { description: "List saved plans in plans/." }, async () => {
    await mkdir(PLANS_DIR, { recursive: true });
    const files = (await readdir(PLANS_DIR)).filter((f) => f.endsWith(".json"));
    return text(files.length ? files.map((f) => f.replace(/\.json$/, "")).join("\n") : "no saved plans");
  });

  server.registerTool("undo", { description: "Undo the last edit." }, async () => text(ed.undo() ? ed.summary() : "nothing to undo"));
  server.registerTool("redo", { description: "Redo the last undone edit." }, async () => text(ed.redo() ? ed.summary() : "nothing to redo"));

  // ----- edits -----

  server.registerTool(
    "place_fob",
    { description: "Place the Forward Operating Base. Everything else must sit inside its 60 m square. Defaults to the origin.", inputSchema: { x: z.number().optional(), z: z.number().optional(), yaw: z.number().optional() } },
    async ({ x, z: zz, yaw }) => json(ed.placeFob(x ?? 0, zz ?? 0, yaw ?? 0)),
  );

  server.registerTool(
    "place",
    {
      description: "Place one piece at (x, z) with yaw in degrees and optional height y. By default it snaps to the nearest compatible socket within snapRadius metres; set snap=false for free placement. parent limits snapping to one piece key.",
      inputSchema: { piece: z.string(), x: z.number(), z: z.number(), yaw: z.number().optional(), y: z.number().optional(), snap: z.boolean().optional(), snapRadius: z.number().optional(), parent: z.string().optional() },
    },
    async ({ piece, x, z: zz, yaw, y, snap, snapRadius, parent }) => json(ed.place(piece, x, zz, yaw ?? 0, y ?? 0, { snap, snapRadius, parent })),
  );

  server.registerTool(
    "wall_run",
    {
      description: "Straight run of one piece type from (x1,z1) to (x2,z2) at socket pitch, long axis along the run. count overrides the piece count; skip lists indexes to leave out (for a gap).",
      inputSchema: { piece: z.string(), x1: z.number(), z1: z.number(), x2: z.number(), z2: z.number(), count: z.number().int().optional(), y: z.number().optional(), skip: z.array(z.number().int()).optional() },
    },
    async ({ piece, x1, z1, x2, z2, count, y, skip }) => json(ed.wallRun(piece, x1, z1, x2, z2, { count, y, skip })),
  );

  server.registerTool(
    "ring",
    {
      description: "Square ring of walls centred on (cx, cz), half metres from centre to each wall line. Optional gap on one side (north=-z, south=+z, east=+x, west=-x), gapWidth metres, and a gate piece placed in the gap.",
      inputSchema: { piece: z.string(), cx: z.number(), cz: z.number(), half: z.number(), gapSide: z.enum(["north", "south", "east", "west"]).optional(), gapWidth: z.number().optional(), gate: z.string().optional(), y: z.number().optional() },
    },
    async ({ piece, cx, cz, half, gapSide, gapWidth, gate, y }) => json(ed.ring(piece, cx, cz, half, { gapSide, gapWidth, gate, y })),
  );

  server.registerTool(
    "perimeter_check",
    { description: "Count open side sockets per wall piece. A sealed wall shows every piece with exactly 2 open sockets (the outward and inward faces), corners included. 3 or more means a hole or a loose end. Optional filter by piece id.", inputSchema: { piece: z.string().optional() } },
    async ({ piece }) => {
      const id = piece ? cat.resolve(piece)?.id : undefined;
      const rows = ed.openSockets(id);
      const suspicious = rows.filter((r) => r.open > 2);
      return text(
        [`${rows.length} pieces checked, ${suspicious.length} with more than 2 open side sockets`, ...suspicious.slice(0, 40).map((r) => `  ${r.key} ${r.id}: ${r.open}/${r.total} open`)].join("\n"),
      );
    },
  );

  server.registerTool("stack", { description: "Stack count more copies on top of piece key using its top socket (respects the stack limit).", inputSchema: { key: z.string(), count: z.number().int().optional() } }, async ({ key, count }) => json(ed.stack(key, count ?? 1)));

  server.registerTool("move", { description: "Move a piece by a delta in metres and degrees.", inputSchema: { key: z.string(), dx: z.number().optional(), dz: z.number().optional(), dy: z.number().optional(), dyaw: z.number().optional() } }, async ({ key, dx, dz, dy, dyaw }) => json(ed.move(key, dx ?? 0, dz ?? 0, dy ?? 0, dyaw ?? 0)));

  server.registerTool("set_pose", { description: "Set a piece's absolute position and/or yaw.", inputSchema: { key: z.string(), x: z.number().optional(), z: z.number().optional(), y: z.number().optional(), yaw: z.number().optional() } }, async ({ key, x, z: zz, y, yaw }) => json(ed.setPose(key, x, zz, y, yaw)));

  server.registerTool("remove", { description: "Remove pieces by key.", inputSchema: { keys: z.array(z.string()) } }, async ({ keys }) => text(`removed ${ed.remove(keys)}`));

  server.registerTool("remove_all", { description: "Remove every piece, or every piece of one id.", inputSchema: { piece: z.string().optional() } }, async ({ piece }) => {
    const id = piece ? cat.resolve(piece)?.id : undefined;
    return text(`removed ${ed.removeWhere((p) => !id || p.id === id)}`);
  });

  // ----- browser -----

  server.registerTool("browser_open", { description: "Open (or focus) the builder in the MCP's own Chromium window. Sign in to Discord there once if you want hub_save." }, async () => {
    await browser.open();
    return json(await browser.readback());
  });

  server.registerTool("browser_push", { description: "Render the current plan (or a given code) in the builder and read back the site's manifest.", inputSchema: { code: z.string().optional() } }, async ({ code }) => json(await browser.push(code ?? ed.code())));

  server.registerTool("browser_pull", { description: "Adopt whatever the builder currently holds as the working plan (captures hand edits made in the window)." }, async () => {
    const code = await browser.pull();
    if (!code) return text("The builder has no draft.");
    ed.loadCode(code);
    return text(ed.summary());
  });

  server.registerTool("browser_readback", { description: "Read the builder's manifest, totals, status line and sign-in state without changing anything." }, async () => json(await browser.readback()));

  server.registerTool(
    "browser_screenshot",
    { description: "Screenshot the builder window to plans/<name>-<time>.png. camera: 1..4 selects the builder's camera presets, 'f' frames the base.", inputSchema: { name: z.string().optional(), camera: z.string().optional() } },
    async ({ name, camera }) => {
      if (camera) await browser.key(camera);
      return text(await browser.screenshot(name ?? "base"));
    },
  );

  server.registerTool("browser_key", { description: "Press a key in the builder (camera 1-4, F frame, Tab cycle, Z/V toggles).", inputSchema: { key: z.string() } }, async ({ key }) => {
    await browser.key(key);
    return text("ok");
  });

  server.registerTool("browser_close", { description: "Close the MCP's browser window." }, async () => {
    await browser.close();
    return text("closed");
  });

  // ----- hub -----

  server.registerTool(
    "hub_import",
    { description: "Open another player's hub base (id or URL like https://wardogs.zone/loadouts/base/hub/a5f1729bb1) and adopt it as the working plan unless adopt=false.", inputSchema: { idOrUrl: z.string(), adopt: z.boolean().optional() } },
    async ({ idOrUrl, adopt }) => {
      const r = await browser.hubImport(idOrUrl);
      if (!r.code) return text(`Loaded ${r.id} but no draft code came back. Readback: ${JSON.stringify(r.readback)}`);
      if (adopt ?? true) ed.loadCode(r.code);
      return text(`hub ${r.id}: ${r.readback.pieces} pieces, ${r.readback.supplies} supplies${adopt ?? true ? "\n" + ed.summary() : "\ncode: " + r.code}`);
    },
  );

  server.registerTool(
    "hub_save",
    { description: "Push the current plan and open the site's save dialog with name and notes filled. Needs a Discord sign-in in the builder window; the user completes any captcha and clicks Save.", inputSchema: { name: z.string(), notes: z.string().optional() } },
    async ({ name, notes }) => {
      await browser.push(ed.code());
      return text(await browser.openSaveDialog(name, notes ?? ""));
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

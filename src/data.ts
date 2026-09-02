import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import type { Buildable, Dataset, Box, Vec3, Snap } from "./types.js";
import { SITE_URL } from "./types.js";

/** Package root: where the code and the seed dataset live (read-only when installed as a bundle). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/**
 * Writable home for plans, screenshots, the browser profile and the dataset cache.
 * A git checkout keeps them in the package folder. An installed copy (npm, npx) must not
 * write inside node_modules, which is read-only in some setups and thrown away between
 * npx runs, so it falls back to the user's home. WARDOGS_HOME overrides both; the .mcpb
 * bundle sets it so nothing is written inside the desktop app's extension folder.
 */
const installed = ROOT.split(path.sep).includes("node_modules");
export const HOME = process.env.WARDOGS_HOME
  ? path.resolve(process.env.WARDOGS_HOME)
  : installed
    ? path.join(homedir(), "wardogs-mcp")
    : ROOT;
export const DATA_DIR = path.join(HOME, "data");
export const PLANS_DIR = path.join(HOME, "plans");
export const PROFILE_DIR = path.join(HOME, ".profile");
const CACHE = path.join(DATA_DIR, "buildables.json");
/** Dataset shipped with the package, used when there is no cache and no network. */
const SEED = path.join(ROOT, "data", "buildables.json");
/** Base-building ruleset, served to any MCP client by the rules tool and resource. */
export const RULES_FILE = path.join(ROOT, "AGENTS.md");
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const rv = (a: number[]) => a.map(r3) as Vec3;
const rbox = (b: any): Box | null => (b ? { min: rv(b.min), max: rv(b.max) } : null);

function unescapeBlob(s: string): string {
  // The site embeds the JSON inside a single quoted JS string literal.
  return s.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "wardogs-mcp/0.1 (personal FOB planning tool)" } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

export async function extractFromSite(): Promise<Dataset> {
  const html = await getText(SITE_URL);
  const origin = new URL(SITE_URL).origin;
  const srcs = [...html.matchAll(/src="([^"]*_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);
  const seen = new Set<string>();
  for (const src of srcs) {
    const url = src.startsWith("http") ? src : origin + src;
    if (seen.has(url)) continue;
    seen.add(url);
    const js = await getText(url);
    if (!js.includes("fobRangeM")) continue;
    const blobs = [...js.matchAll(/JSON\.parse\('(\{[\s\S]*?)'\)\}/g)].map((m) => JSON.parse(unescapeBlob(m[1])));
    const B = blobs.find((b) => b.buildables);
    const V = blobs.find((b) => b.vehicles);
    const S = blobs.find((b) => b.structures);
    if (!B) continue;
    const buildables: Buildable[] = B.buildables.map((b: any) => ({
      id: b.id,
      kind: b.kind,
      name: b.name,
      label: b.label ?? b.name,
      cost: b.cost ?? 0,
      placementCost: b.placementCost ?? 0,
      health: b.health ?? 0,
      c4: b.c4 ?? null,
      maxStack: b.maxStack ?? 0,
      fobOnly: !!b.fobOnly,
      selectable: b.selectable !== false,
      box: rbox(b.box),
      collisionBox: rbox(b.collisionBox),
      // quats stay at full precision, rounding them breaks exact socket maths
      snaps: (b.snaps ?? []).map((s: any): Snap => ({ pos: rv(s.pos), quat: [...s.quat] as Snap["quat"] })),
      meshCount: (b.meshes ?? []).length,
      hasDoor: (b.meshes ?? []).some((m: any) => m.door),
    }));
    for (const v of V?.vehicles ?? []) {
      buildables.push({
        id: `v/${v.id}`,
        kind: "vehicle",
        name: v.name,
        label: v.label ?? v.name,
        cost: 0,
        placementCost: 0,
        health: v.health ?? 0,
        c4: null,
        maxStack: 0,
        fobOnly: false,
        selectable: true,
        box: rbox(v.box),
        collisionBox: rbox(v.box),
        snaps: [],
        meshCount: (v.meshes ?? []).length,
        hasDoor: false,
        cash: v.price ?? 0,
        seats: v.seats,
      });
    }
    for (const s of S?.structures ?? []) {
      buildables.push({
        id: `s/${s.id}`,
        kind: "structure",
        name: s.name,
        label: s.name,
        cost: 0,
        placementCost: 0,
        health: 0,
        c4: null,
        maxStack: 0,
        fobOnly: false,
        selectable: true,
        box: rbox(s.box),
        collisionBox: null,
        snaps: [],
        meshCount: (s.meshes ?? []).length,
        hasDoor: false,
        world: s.world,
      });
    }
    return { fetchedAt: new Date().toISOString(), source: url, fobRangeM: B.fobRangeM ?? 60, buildables };
  }
  throw new Error("Could not find the buildables blob in any wardogs.zone chunk. The site may have changed.");
}

let cached: Dataset | null = null;

export async function loadDataset(opts: { refresh?: boolean } = {}): Promise<Dataset> {
  if (cached && !opts.refresh) return cached;
  if (!opts.refresh && existsSync(CACHE)) {
    const ds = JSON.parse(await readFile(CACHE, "utf8")) as Dataset;
    if (Date.now() - Date.parse(ds.fetchedAt) < MAX_AGE_MS) {
      cached = ds;
      return ds;
    }
  }
  try {
    const ds = await extractFromSite();
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(CACHE, JSON.stringify(ds, null, 1));
    cached = ds;
    return ds;
  } catch (err) {
    // Stale cache beats no data, and the seed shipped with the package beats nothing.
    for (const file of [CACHE, SEED]) {
      if (existsSync(file)) {
        cached = JSON.parse(await readFile(file, "utf8")) as Dataset;
        return cached;
      }
    }
    throw err;
  }
}

export class Catalog {
  private map = new Map<string, Buildable>();
  private byLabel = new Map<string, Buildable>();
  constructor(public readonly ds: Dataset) {
    for (const b of ds.buildables) {
      this.map.set(b.id, b);
      this.byLabel.set(b.label.toLowerCase(), b);
      this.byLabel.set(b.name.toLowerCase(), b);
    }
  }
  get fobRange(): number {
    return this.ds.fobRangeM;
  }
  get(id: string): Buildable | undefined {
    return this.map.get(id);
  }
  // Accepts an id, a label, or a loose name like "hesco small" / "mortar".
  resolve(query: string): Buildable | undefined {
    const q = query.trim().toLowerCase();
    if (this.map.has(q)) return this.map.get(q);
    if (this.byLabel.has(q)) return this.byLabel.get(q);
    const words = q.split(/[\s_-]+/).filter(Boolean);
    const hits = this.ds.buildables.filter(
      (b) => b.selectable && words.every((w) => (b.label + " " + b.id).toLowerCase().includes(w)),
    );
    if (hits.length === 1) return hits[0];
    // Prefer an exact word match on label, then the cheapest.
    hits.sort((a, b) => a.label.length - b.label.length);
    return hits[0];
  }
  footprint(b: Buildable): [number, number] {
    const box = b.collisionBox ?? b.box;
    return box ? [box.max[0] - box.min[0], box.max[2] - box.min[2]] : [1, 1];
  }
  envelopeBox(b: Buildable): Box | null {
    const boxes = [b.box, b.collisionBox].filter((x): x is Box => !!x);
    if (!boxes.length) return null;
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const bx of boxes)
      for (let i = 0; i < 3; i++) {
        if (bx.min[i] < min[i]) min[i] = bx.min[i];
        if (bx.max[i] > max[i]) max[i] = bx.max[i];
      }
    return { min, max };
  }
  list(kind?: string): Buildable[] {
    return this.ds.buildables.filter((b) => b.selectable && (!kind || b.kind === kind));
  }
}

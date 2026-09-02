import type { Plan, Piece, Vec3, Buildable } from "./types.js";
import { FOB_ID, BASE_PIECES_MAX } from "./types.js";
import type { Catalog } from "./data.js";
import { decodePlan, encodePlan, findSnap, rowRun, sanitizePlan, planStats, validatePlan, describePiece, worldSnaps } from "./plan.js";
import { normYaw, rad, round2, snapKind, deg } from "./math.js";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function newKey(): string {
  let k = "b";
  for (let i = 0; i < 8; i++) k += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return k;
}

export interface PlaceOpts {
  snap?: boolean; // try to land on a socket of a nearby piece (default true)
  snapRadius?: number; // metres, default 2.5
  parent?: string; // only snap to this piece key
}

export interface PlaceResult {
  piece: Piece;
  snapped: boolean;
  parent?: string;
  moved: number; // metres between requested and final position
}

export interface RunResult {
  keys: string[];
  count: number;
  step: number;
  socketMatched: number;
  yawDeg: number;
}

/**
 * Holds the working plan. All positions are metres on the flat pad, y up.
 * Yaw is stored in radians, exposed in degrees at the tool boundary.
 */
export class Editor {
  plan: Plan = { world: null, pieces: [] };
  private history: Plan[] = [];
  private future: Plan[] = [];

  constructor(public readonly cat: Catalog) {}

  // ----- state -----

  private commit() {
    this.history.push(structuredClone(this.plan));
    if (this.history.length > 200) this.history.shift();
    this.future = [];
  }

  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.future.push(this.plan);
    this.plan = prev;
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.history.push(this.plan);
    this.plan = next;
    return true;
  }

  reset(world: string | null = null) {
    this.commit();
    this.plan = { world, pieces: [] };
  }

  loadCode(code: string) {
    this.commit();
    const decoded = sanitizePlan(decodePlan(code, this.cat), this.cat);
    // give every piece a unique session key
    decoded.pieces = decoded.pieces.map((p) => ({ ...p, key: newKey() }));
    this.plan = decoded;
  }

  code(): string {
    return encodePlan(sanitizePlan(this.plan, this.cat));
  }

  stats() {
    return planStats(this.plan, this.cat);
  }

  validate() {
    return validatePlan(this.plan, this.cat);
  }

  get(key: string): Piece | undefined {
    return this.plan.pieces.find((p) => p.key === key);
  }

  resolve(query: string): Buildable {
    const b = this.cat.resolve(query);
    if (!b) throw new Error(`No buildable matches "${query}". Use list_buildables.`);
    return b;
  }

  // ----- edits -----

  place(query: string, x: number, z: number, yawDeg = 0, y = 0, opts: PlaceOpts = {}): PlaceResult {
    const b = this.resolve(query);
    if (this.plan.pieces.length >= BASE_PIECES_MAX) throw new Error(`Plan is full (${BASE_PIECES_MAX} pieces)`);
    const want: Vec3 = [x, y, z];
    let pos: Vec3 = want;
    let yaw = normYaw(rad(yawDeg));
    let snapped = false;
    let parent: string | undefined;
    const doSnap = opts.snap ?? true;
    if (doSnap && b.snaps.length && this.plan.pieces.length) {
      const hit = findSnap(this.plan, b, want, 0, this.cat, opts.snapRadius ?? 2.5, opts.parent);
      if (hit) {
        pos = hit.pos;
        // keep the caller's orientation when the piece is square-symmetric, otherwise the socket's
        yaw = this.isSquare(b) ? yaw : normYaw(hit.yaw);
        snapped = true;
        parent = hit.parent;
      }
    }
    this.commit();
    const piece: Piece = { key: newKey(), id: b.id, pos: [round2(pos[0]), round2(pos[1]), round2(pos[2])], yaw };
    this.plan.pieces.push(piece);
    return { piece, snapped, parent, moved: round2(Math.hypot(pos[0] - want[0], pos[1] - want[1], pos[2] - want[2])) };
  }

  placeFob(x = 0, z = 0, yawDeg = 0): PlaceResult {
    return this.place(FOB_ID, x, z, yawDeg, 0, { snap: false });
  }

  remove(keys: string[]): number {
    const set = new Set(keys);
    const before = this.plan.pieces.length;
    this.commit();
    this.plan.pieces = this.plan.pieces.filter((p) => !set.has(p.key));
    return before - this.plan.pieces.length;
  }

  removeWhere(pred: (p: Piece) => boolean): number {
    return this.remove(this.plan.pieces.filter(pred).map((p) => p.key));
  }

  move(key: string, dx: number, dz: number, dy = 0, dYawDeg = 0): Piece {
    const p = this.get(key);
    if (!p) throw new Error(`No piece ${key}`);
    this.commit();
    p.pos = [round2(p.pos[0] + dx), round2(p.pos[1] + dy), round2(p.pos[2] + dz)];
    p.yaw = normYaw(p.yaw + rad(dYawDeg));
    return p;
  }

  setPose(key: string, x?: number, z?: number, y?: number, yawDeg?: number): Piece {
    const p = this.get(key);
    if (!p) throw new Error(`No piece ${key}`);
    this.commit();
    p.pos = [round2(x ?? p.pos[0]), round2(y ?? p.pos[1]), round2(z ?? p.pos[2])];
    if (yawDeg !== undefined) p.yaw = normYaw(rad(yawDeg));
    return p;
  }

  /**
   * Straight wall from (x1,z1) to (x2,z2). Piece centres sit on the line, spaced by the
   * piece's socket pitch, so neighbours share sockets exactly as the site would snap them.
   */
  wallRun(query: string, x1: number, z1: number, x2: number, z2: number, opts: { count?: number; y?: number; skip?: number[] } = {}): RunResult {
    const b = this.resolve(query);
    const run = rowRun(b, this.cat);
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) throw new Error("wall_run needs two different points");
    const ux = dx / len, uz = dz / len;
    const n = opts.count ?? Math.max(1, Math.round(len / run.step));
    // orient the piece's long axis along the run
    const yaw = run.axis === "x" ? Math.atan2(-uz, ux) : Math.atan2(ux, uz);
    const y = opts.y ?? 0;
    const skip = new Set(opts.skip ?? []);
    this.commit();
    const keys: string[] = [];
    let matched = 0;
    let prev: Piece | null = null;
    for (let k = 0; k < n; k++) {
      if (skip.has(k)) { prev = null; continue; }
      if (this.plan.pieces.length >= BASE_PIECES_MAX) break;
      const cx = x1 + ux * run.step * (k + 0.5);
      const cz = z1 + uz * run.step * (k + 0.5);
      const piece: Piece = { key: newKey(), id: b.id, pos: [round2(cx), round2(y), round2(cz)], yaw: normYaw(yaw) };
      if (prev) {
        const hit = findSnap({ world: null, pieces: [prev] }, b, piece.pos, 0, this.cat, run.step, prev.key);
        if (hit && hit.distance < 0.02) matched++;
      }
      this.plan.pieces.push(piece);
      keys.push(piece.key);
      prev = piece;
    }
    return { keys, count: keys.length, step: round2(run.step), socketMatched: matched, yawDeg: Math.round(deg(normYaw(yaw))) };
  }

  /**
   * Square ring of walls centred on (cx, cz), half = metres from centre to the wall centre line.
   * Every block sits on one socket lattice, so corners are 90 degrees and each block shares
   * sockets with its neighbours exactly as the game's snap would place them.
   * Optional gap on one side (north = -z, south = +z, east = +x, west = -x) and a gate in it.
   */
  ring(query: string, cx: number, cz: number, half: number, opts: { gapSide?: "north" | "south" | "east" | "west"; gapWidth?: number; gate?: string; y?: number } = {}): { sides: RunResult[]; gate?: PlaceResult; half: number; gapPieces: number; gapWidth: number } {
    const b = this.resolve(query);
    const run = rowRun(b, this.cat);
    const step = run.step;
    const y = opts.y ?? 0;
    // n blocks per side on the lattice, corner blocks shared; centre-to-centreline = (n-1)*step/2
    const n = Math.max(2, Math.round((2 * half) / step) + 1);
    half = ((n - 1) * step) / 2;
    const at = (col: number, row: number): [number, number] => [cx - half + col * step, cz - half + row * step];
    const gapW = opts.gapWidth ?? (opts.gate ? 6 : 0);
    const gb = opts.gate ? this.resolve(opts.gate) : null;
    const gateLen = gb ? rowRun(gb, this.cat).step : 0;
    const nGap = gapW > 0 ? Math.max(1, Math.round(Math.max(gapW, gateLen) / step)) : 0;
    // lattice cells for each side, walking clockwise; yaw puts the block's long axis along the wall
    const sideCells: { name: "north" | "east" | "south" | "west"; cells: [number, number][]; yawDeg: number; dir: [number, number] }[] = [
      { name: "north", cells: Array.from({ length: n }, (_, k) => [k, 0] as [number, number]), yawDeg: 0, dir: [1, 0] },
      { name: "east", cells: Array.from({ length: n - 1 }, (_, k) => [n - 1, k + 1] as [number, number]), yawDeg: 270, dir: [0, 1] },
      { name: "south", cells: Array.from({ length: n - 1 }, (_, k) => [n - 2 - k, n - 1] as [number, number]), yawDeg: 180, dir: [-1, 0] },
      { name: "west", cells: Array.from({ length: n - 2 }, (_, k) => [0, n - 2 - k] as [number, number]), yawDeg: 90, dir: [0, -1] },
    ];
    // the run axis decides which local axis lies along the wall
    const yawFor = (dir: [number, number]) => (run.axis === "x" ? Math.atan2(-dir[1], dir[0]) : Math.atan2(dir[0], dir[1]));
    let gateCentre: [number, number] | null = null;
    let gateDir: [number, number] | null = null;
    this.commit();
    const sides: RunResult[] = [];
    for (const side of sideCells) {
      let cells = side.cells;
      if (opts.gapSide === side.name && nGap > 0) {
        // gap in the middle of the side, never eating a corner cell
        const inner = side.name === "north" ? cells.slice(1, -1) : side.name === "east" || side.name === "south" ? cells.slice(0, -1) : cells;
        const k0 = Math.max(0, Math.round(inner.length / 2 - nGap / 2));
        const gapCells = inner.slice(k0, k0 + nGap);
        const gapSet = new Set(gapCells.map((c) => c.join(",")));
        cells = cells.filter((c) => !gapSet.has(c.join(",")));
        const first = at(...gapCells[0]), last = at(...gapCells[gapCells.length - 1]);
        gateCentre = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
        gateDir = side.dir;
      }
      const yaw = normYaw(yawFor(side.dir));
      const keys: string[] = [];
      let matched = 0;
      let prev: Piece | null = null;
      for (const c of cells) {
        if (this.plan.pieces.length >= BASE_PIECES_MAX) break;
        const [px, pz] = at(...c);
        const piece: Piece = { key: newKey(), id: b.id, pos: [round2(px), round2(y), round2(pz)], yaw };
        this.plan.pieces.push(piece);
        if (prev && this.socketsMet(piece).met > 0) matched++;
        keys.push(piece.key);
        prev = piece;
      }
      sides.push({ keys, count: keys.length, step: round2(step), socketMatched: matched, yawDeg: Math.round(deg(yaw)) });
    }
    let gate: PlaceResult | undefined;
    if (gb && gateCentre && gateDir) {
      const grun = rowRun(gb, this.cat);
      const [ux, uz] = gateDir;
      const yaw = grun.axis === "x" ? Math.atan2(-uz, ux) : Math.atan2(ux, uz);
      gate = this.place(gb.id, gateCentre[0], gateCentre[1], deg(yaw), y, { snap: false });
      this.history.pop();
      const met = this.socketsMet(gate.piece);
      gate.snapped = met.met === met.total && met.total > 0;
      gate.parent = met.parents.join(",") || undefined;
    }
    return { sides, gate, half: round2(half), gapPieces: nGap, gapWidth: round2(nGap * step) };
  }

  /** Stack `count` more of the same piece on top of an existing one using its top socket. */
  stack(key: string, count = 1): string[] {
    const base = this.get(key);
    if (!base) throw new Error(`No piece ${key}`);
    const b = this.cat.get(base.id)!;
    const top = b.snaps.find((s) => snapKind(s.quat) === "top");
    if (!top) throw new Error(`${b.label} has no top socket to stack on`);
    if (b.maxStack >= 1) {
      // how many of the same piece already sit in this column at or below the base
      const below = this.plan.pieces.filter(
        (o) => o.id === base.id && Math.abs(o.pos[0] - base.pos[0]) <= 0.4 && Math.abs(o.pos[2] - base.pos[2]) <= 0.4 && o.pos[1] <= base.pos[1] + 0.4,
      ).length;
      if (below + count > b.maxStack) throw new Error(`${b.label} stacks ${b.maxStack} high, column already has ${below}`);
    }
    this.commit();
    const keys: string[] = [];
    let prev = base;
    for (let i = 0; i < count; i++) {
      const target: Vec3 = [prev.pos[0], prev.pos[1] + top.pos[1], prev.pos[2]];
      const hit = findSnap({ world: null, pieces: [prev] }, b, target, 0, this.cat, 1.5, prev.key);
      const pos = hit ? hit.pos : target;
      const piece: Piece = { key: newKey(), id: b.id, pos: [round2(pos[0]), round2(pos[1]), round2(pos[2])], yaw: prev.yaw };
      this.plan.pieces.push(piece);
      keys.push(piece.key);
      prev = piece;
    }
    return keys;
  }

  /** For one piece, count its side sockets that coincide (within 2 cm) with a side socket of another piece. */
  socketsMet(piece: Piece): { met: number; total: number; parents: string[] } {
    const b = this.cat.get(piece.id);
    if (!b) return { met: 0, total: 0, parents: [] };
    const mine = worldSnaps(piece, b).filter((s) => s.kind === "side");
    const parents = new Set<string>();
    let met = 0;
    for (const s of mine) {
      for (const o of this.plan.pieces) {
        if (o.key === piece.key) continue;
        const ob = this.cat.get(o.id);
        if (!ob || !ob.snaps.length) continue;
        if (Math.hypot(o.pos[0] - s.pos[0], o.pos[2] - s.pos[2]) > 8) continue;
        const hit = worldSnaps(o, ob).some((t) => t.kind === "side" && Math.hypot(t.pos[0] - s.pos[0], t.pos[1] - s.pos[1], t.pos[2] - s.pos[2]) < 0.02);
        if (hit) { met++; parents.add(o.key); break; }
      }
    }
    return { met, total: mine.length, parents: [...parents] };
  }

  /** Sockets left open on every wall-type piece: a quick way to find holes in a perimeter. */
  openSockets(id?: string): { key: string; id: string; open: number; total: number }[] {
    return this.plan.pieces
      .filter((p) => (!id || p.id === id) && (this.cat.get(p.id)?.snaps.length ?? 0) > 0)
      .map((p) => { const m = this.socketsMet(p); return { key: p.key, id: p.id, open: m.total - m.met, total: m.total }; });
  }

  /** Wall-type pieces (have side sockets) that share no socket with any other piece. */
  floating(): { key: string; id: string }[] {
    const walls = this.plan.pieces.filter((p) => {
      const b = this.cat.get(p.id);
      return b && b.kind === "fortification" && b.snaps.some((s) => snapKind(s.quat) === "side");
    });
    if (walls.length < 2) return [];
    return walls.filter((p) => this.socketsMet(p).met === 0).map((p) => ({ key: p.key, id: p.id }));
  }

  // ----- reporting -----

  summary(): string {
    const s = this.stats();
    const lines = [
      `world: ${this.plan.world ?? "open pad"}  pieces: ${s.pieces}  fobs: ${s.fobs}  supplies: ${s.supplies}  vehicles: $${s.cash}  structure hp: ${s.health}`,
    ];
    for (const b of s.breakdown) lines.push(`  ${b.count} x ${b.name} = ${b.supplies}${b.cash ? ` + $${b.cash}` : ""}`);
    return lines.join("\n");
  }

  listPieces(filter?: string): string[] {
    return this.plan.pieces
      .filter((p) => !filter || p.id === filter || (this.cat.get(p.id)?.label ?? "").toLowerCase().includes(filter.toLowerCase()))
      .map((p) => describePiece(p, this.cat));
  }

  private isSquare(b: Buildable): boolean {
    const [fx, fz] = this.cat.footprint(b);
    return Math.abs(fx - fz) < 0.05;
  }
}

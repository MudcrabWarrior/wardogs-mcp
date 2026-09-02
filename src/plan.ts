import type { Plan, Piece, Vec3, Buildable } from "./types.js";
import { BASE_PIECES_MAX, BASE_REACH_M, FOB_ID, SITE_IDS, SUPPORT_MAX_M } from "./types.js";
import type { Catalog } from "./data.js";
import {
  QUARTER,
  SNAP_MATE,
  envelope,
  normYaw,
  obbOverlap,
  quatFromYaw,
  rot2,
  rotate,
  round2,
  snapKind,
  yawFromQuat,
  deg,
} from "./math.js";

// ---------- codec (exact port of the site's encodePlan / decodePlan) ----------

export function decodePlan(code: string, cat: Catalog): Plan {
  const [world, idList, pieceList] = code.split("|");
  const ids = idList ? idList.split(",") : [];
  const pieces: Piece[] = [];
  const rows = pieceList ? pieceList.split(";") : [];
  rows.forEach((row, i) => {
    const f = row.split(",");
    const [idx, x, y, z, yawDeg] = f.map(Number);
    const id = ids[idx];
    if (!id || !cat.get(id)) return;
    const hidden = f[5]
      ? f[5].split(".").map(Number).filter((n) => Number.isInteger(n) && n >= 0)
      : undefined;
    pieces.push({
      key: `p${i}`,
      id,
      pos: [x / 100, y / 100, z / 100],
      yaw: (yawDeg * Math.PI) / 180,
      ...(hidden?.length ? { hidden } : {}),
    });
  });
  return { world: world || null, pieces };
}

export function encodePlan(plan: Plan): string {
  const ids = [...new Set(plan.pieces.map((p) => p.id))];
  const rows = plan.pieces.map((p) => {
    const f = [
      String(ids.indexOf(p.id)),
      String(Math.round(100 * p.pos[0])),
      String(Math.round(100 * p.pos[1])),
      String(Math.round(100 * p.pos[2])),
      String(Math.round((180 * p.yaw) / Math.PI)),
    ];
    if (p.hidden?.length) f.push(p.hidden.join("."));
    return f.join(",");
  });
  return [plan.world ?? "", ids.join(","), rows.join(";")].join("|");
}

export function sanitizePlan(plan: Plan, cat: Catalog): Plan {
  const out: Piece[] = [];
  for (const p of plan.pieces) {
    if (out.length >= BASE_PIECES_MAX) break;
    const b = cat.get(p.id);
    if (!b) continue;
    const pos = p.pos;
    if (!Array.isArray(pos) || pos.length !== 3 || !pos.every((n) => Number.isFinite(n) && Math.abs(n) <= BASE_REACH_M)) continue;
    const yaw = Number.isFinite(p.yaw) ? p.yaw : 0;
    let hidden: number[] | undefined;
    if (Array.isArray(p.hidden) && p.hidden.length) {
      const s = new Set<number>();
      for (const h of p.hidden) if (Number.isInteger(h) && h >= 0 && h < b.meshCount) s.add(h);
      if (s.size) hidden = [...s].sort((a, c) => a - c);
    }
    out.push({
      key: `p${out.length}`,
      id: p.id,
      pos: [round2(pos[0]), round2(pos[1]), round2(pos[2])],
      yaw: normYaw(yaw),
      ...(hidden ? { hidden } : {}),
    });
  }
  return { world: plan.world && SITE_IDS.has(plan.world) ? plan.world : null, pieces: out };
}

// ---------- stats (port of planStats) ----------

export interface Stats {
  supplies: number;
  placement: number;
  cash: number;
  health: number;
  pieces: number;
  fobs: number;
  breakdown: { id: string; name: string; count: number; supplies: number; cash: number }[];
}

export function planStats(plan: Plan, cat: Catalog): Stats {
  const counts = new Map<string, number>();
  for (const p of plan.pieces) counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
  let supplies = 0, placement = 0, cash = 0, health = 0;
  const breakdown: Stats["breakdown"] = [];
  for (const [id, n] of counts) {
    const b = cat.get(id);
    if (!b) continue;
    supplies += b.cost * n;
    placement += b.placementCost * n;
    cash += (b.cash ?? 0) * n;
    if (b.kind !== "vehicle") health += b.health * n;
    breakdown.push({ id, name: b.label, count: n, supplies: b.cost * n, cash: (b.cash ?? 0) * n });
  }
  breakdown.sort((a, b) => b.supplies + b.cash - (a.supplies + a.cash) || a.name.localeCompare(b.name));
  return {
    supplies,
    placement,
    cash,
    health,
    pieces: plan.pieces.length,
    fobs: plan.pieces.filter((p) => p.id === FOB_ID).length,
    breakdown,
  };
}

// ---------- snapping (port of findSnap) ----------

export interface SnapResult {
  pos: Vec3;
  yaw: number;
  parent: string;
  kind: "top" | "bottom" | "side";
  distance: number;
}

export function worldSnaps(piece: Piece, b: Buildable) {
  const q = quatFromYaw(piece.yaw);
  return b.snaps.map((s, index) => {
    const r = rotate(q, s.pos);
    return {
      owner: piece.key,
      index,
      kind: snapKind(s.quat),
      pos: [piece.pos[0] + r[0], piece.pos[1] + r[1], piece.pos[2] + r[2]] as Vec3,
      yaw: piece.yaw + yawFromQuat(s.quat),
    };
  });
}

export function findSnap(
  plan: Plan,
  b: Buildable,
  point: Vec3,
  yawIn: number,
  cat: Catalog,
  radius = 2.5,
  onlyParent?: string,
): SnapResult | null {
  let best: SnapResult | null = null;
  for (const piece of plan.pieces) {
    if (onlyParent && piece.key !== onlyParent) continue;
    const pb = cat.get(piece.id);
    if (!pb) continue;
    for (const a of worldSnaps(piece, pb)) {
      const dx = a.pos[0] - point[0], dy = a.pos[1] - point[1], dz = a.pos[2] - point[2];
      if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
      const want = SNAP_MATE[a.kind];
      for (const s of b.snaps) {
        if (snapKind(s.quat) !== want) continue;
        const extra = Math.round(yawIn / QUARTER) * QUARTER;
        const h = want === "side" ? a.yaw + Math.PI - yawFromQuat(s.quat) : a.yaw;
        const d = rotate(quatFromYaw(h), s.pos);
        const pos: Vec3 = [a.pos[0] - d[0], a.pos[1] - d[1], a.pos[2] - d[2]];
        const yaw = h + extra;
        const distance = Math.hypot(pos[0] - point[0], pos[1] - point[1], pos[2] - point[2]);
        if (!best || distance < best.distance) best = { pos, yaw, parent: piece.key, kind: a.kind, distance };
      }
    }
  }
  return best;
}

// Distance between neighbouring pieces in a row, from the side sockets (port of rowSteps).
export function rowSteps(b: Buildable, cat: Catalog): { x: number; z: number } {
  const [fx, fz] = cat.footprint(b);
  let x = Math.max(0.3, fx), z = Math.max(0.3, fz);
  const sides = b.snaps.filter((s) => snapKind(s.quat) === "side");
  if (sides.length >= 2) {
    const xs = sides.map((s) => s.pos[0]), zs = sides.map((s) => s.pos[2]);
    const sx = Math.max(...xs) - Math.min(...xs), sz = Math.max(...zs) - Math.min(...zs);
    if (sx > 0.3) x = sx;
    if (sz > 0.3) z = sz;
  }
  return { x, z };
}

export function rowRun(b: Buildable, cat: Catalog): { axis: "x" | "z"; step: number } {
  const s = rowSteps(b, cat);
  return s.x >= s.z ? { axis: "x", step: s.x } : { axis: "z", step: s.z };
}

// ---------- validation (port of the placement check, run over a whole plan) ----------

export interface Issue {
  key: string;
  id: string;
  reason: "nofob" | "range" | "stack" | "support" | "overlap" | "fobspacing" | "reach";
  detail: string;
}

function fobs(plan: Plan) {
  return plan.pieces.filter((p) => p.id === FOB_ID);
}

export function inBuildArea(plan: Plan, pos: Vec3, range: number): boolean {
  return fobs(plan).some((f) => {
    const [lx, lz] = rot2(pos[0] - f.pos[0], pos[2] - f.pos[2], -f.yaw);
    return Math.abs(lx) <= range && Math.abs(lz) <= range;
  });
}

export function validatePlan(plan: Plan, cat: Catalog): Issue[] {
  const issues: Issue[] = [];
  const range = cat.fobRange;
  const fobList = fobs(plan);
  const envs = plan.pieces.map((p) => {
    const b = cat.get(p.id);
    const box = b ? cat.envelopeBox(b) : null;
    return box ? envelope(box, p.yaw, p.pos) : null;
  });
  const kinds = plan.pieces.map((p) => cat.get(p.id)?.kind ?? "none");

  // FOB spacing: 120 m between FOB centres, in each other's rotated square.
  for (let i = 0; i < fobList.length; i++)
    for (let j = i + 1; j < fobList.length; j++) {
      const a = fobList[i], c = fobList[j];
      const dx = c.pos[0] - a.pos[0], dz = c.pos[2] - a.pos[2];
      const axes = [rot2(1, 0, a.yaw), rot2(0, 1, a.yaw), rot2(1, 0, c.yaw), rot2(0, 1, c.yaw)];
      const ra = [axes[0], axes[1]], rb = [axes[2], axes[3]];
      let sep = false;
      for (const e of axes) {
        const proj = Math.abs(dx * e[0] + dz * e[1]);
        const ext =
          range * (Math.abs(ra[0][0] * e[0] + ra[0][1] * e[1]) + Math.abs(ra[1][0] * e[0] + ra[1][1] * e[1])) +
          range * (Math.abs(rb[0][0] * e[0] + rb[0][1] * e[1]) + Math.abs(rb[1][0] * e[0] + rb[1][1] * e[1]));
        if (proj >= ext) { sep = true; break; }
      }
      if (!sep) issues.push({ key: c.key, id: c.id, reason: "fobspacing", detail: `too close to ${a.key}, keep ${2 * range} m between FOBs` });
    }

  for (let i = 0; i < plan.pieces.length; i++) {
    const p = plan.pieces[i];
    const b = cat.get(p.id);
    if (!b) continue;
    if (p.pos.some((n) => Math.abs(n) > BASE_REACH_M)) {
      issues.push({ key: p.key, id: p.id, reason: "reach", detail: `beyond ${BASE_REACH_M} m from origin, the site drops it` });
      continue;
    }
    if (b.kind === "structure" || b.kind === "vehicle" || b.id === FOB_ID) continue;
    if (!fobList.length) {
      issues.push({ key: p.key, id: p.id, reason: "nofob", detail: "no Forward Operating Base in the plan" });
      continue;
    }
    if (!inBuildArea(plan, p.pos, range)) {
      issues.push({ key: p.key, id: p.id, reason: "range", detail: `outside every FOB's ${range} m build square` });
    }
    // Stack limit: same id within 0.4 m on xz, not above.
    if (b.maxStack >= 1) {
      let n = 0;
      for (const o of plan.pieces) {
        if (o === p || o.id !== p.id) continue;
        if (Math.abs(o.pos[0] - p.pos[0]) > 0.4 || Math.abs(o.pos[2] - p.pos[2]) > 0.4) continue;
        if (o.pos[1] > p.pos[1] + 0.4) continue;
        n++;
      }
      if (n >= b.maxStack) issues.push({ key: p.key, id: p.id, reason: "stack", detail: `${b.label} stacks ${b.maxStack} high, this one is number ${n + 1}` });
    }
    // Support: y above the lowest connected piece must be <= 15 m.
    if (p.pos[1] > SUPPORT_MAX_M + 0.01) {
      const env = envs[i];
      let lowest: number | null = null;
      if (env) {
        const seen = new Array(plan.pieces.length).fill(false);
        const stack = [env];
        while (stack.length) {
          const t = stack.pop()!;
          for (let j = 0; j < envs.length; j++) {
            if (seen[j] || kinds[j] === "vehicle" || kinds[j] === "structure") continue;
            const e = envs[j];
            if (!e || !touches(t, e)) continue;
            seen[j] = true;
            const y = plan.pieces[j].pos[1];
            if (lowest === null || y < lowest) lowest = y;
            stack.push(e);
          }
        }
      }
      if (p.pos[1] - (lowest ?? 0) > SUPPORT_MAX_M + 0.01)
        issues.push({ key: p.key, id: p.id, reason: "support", detail: `too far above its foundation, ${SUPPORT_MAX_M} m is the limit` });
    }
    // Overlap, piece level boxes. The site checks per mesh, so hollow pieces
    // (bunker, shelter) can hold things the site allows and this flags. Treat as a warning.
    const box = b.collisionBox ?? b.box;
    if (!box) continue;
    for (let j = 0; j < i; j++) {
      const o = plan.pieces[j];
      const ob = cat.get(o.id);
      if (!ob || ob.kind === "structure" || ob.id === FOB_ID) continue;
      const obox = ob.collisionBox ?? ob.box;
      if (!obox) continue;
      if (!envs[i] || !envs[j] || !touches(envs[i]!, envs[j]!)) continue;
      if (obbOverlap(box, p.pos, p.yaw, obox, o.pos, o.yaw)) {
        issues.push({ key: p.key, id: p.id, reason: "overlap", detail: `stands inside ${o.key} (${ob.label})` });
        break;
      }
    }
  }
  return issues;
}

function touches(a: { min: Vec3; max: Vec3 }, b: { min: Vec3; max: Vec3 }): boolean {
  return (
    a.min[0] <= b.max[0] + 0.3 && a.max[0] >= b.min[0] - 0.3 &&
    a.min[1] <= b.max[1] + 0.3 && a.max[1] >= b.min[1] - 0.3 &&
    a.min[2] <= b.max[2] + 0.3 && a.max[2] >= b.min[2] - 0.3
  );
}

export function describePiece(p: Piece, cat: Catalog): string {
  const b = cat.get(p.id);
  return `${p.key} ${b?.label ?? p.id} @ (${round2(p.pos[0])}, ${round2(p.pos[1])}, ${round2(p.pos[2])}) yaw ${Math.round(deg(p.yaw))}`;
}

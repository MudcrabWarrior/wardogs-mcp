import type { Quat, Vec3, Box } from "./types.js";

export const TAU = Math.PI * 2;
export const QUARTER = Math.PI / 2;

// Rotate v by quaternion q. Same formula the site uses.
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + y * tz - z * ty,
    vy + w * ty + z * tx - x * tz,
    vz + w * tz + x * ty - y * tx,
  ];
}

export function quatFromYaw(yaw: number): Quat {
  return [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
}

export function yawFromQuat(q: Quat): number {
  const [x, y, z, w] = q;
  return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + x * x));
}

export type SnapKind = "top" | "bottom" | "side";

export function snapKind(q: Quat): SnapKind {
  const [x, y, z, w] = q;
  const deg = (180 * Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z))) / Math.PI;
  return deg > 45 ? "top" : deg < -45 ? "bottom" : "side";
}

export const SNAP_MATE: Record<SnapKind, SnapKind> = { top: "bottom", bottom: "top", side: "side" };

export function normYaw(yaw: number): number {
  return ((yaw % TAU) + TAU) % TAU;
}

export function deg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function rad(d: number): number {
  return (d * Math.PI) / 180;
}

// Rotate a 2D (x, z) vector by yaw in the site's convention.
export function rot2(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

export function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// World-space axis-aligned envelope of a local box under yaw and offset.
export function envelope(box: Box, yaw: number, pos: Vec3): Box {
  const q = quatFromYaw(yaw);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [box.min[0], box.max[0]])
    for (const y of [box.min[1], box.max[1]])
      for (const z of [box.min[2], box.max[2]]) {
        const p = rotate(q, [x, y, z]);
        for (let i = 0; i < 3; i++) {
          const v = p[i] + pos[i];
          if (v < min[i]) min[i] = v;
          if (v > max[i]) max[i] = v;
        }
      }
  return { min, max };
}

// Oriented box overlap test on the XZ plane with a Y interval check, ported
// from the site's placement check. Boxes are local, each with its own yaw/pos.
export function obbOverlap(a: Box, aPos: Vec3, aYaw: number, b: Box, bPos: Vec3, bYaw: number): boolean {
  const yOverlap =
    Math.min(aPos[1] + a.max[1], bPos[1] + b.max[1]) - Math.max(aPos[1] + a.min[1], bPos[1] + b.min[1]);
  if (yOverlap <= 0.05) return false;
  const ca = rot2((a.min[0] + a.max[0]) / 2, (a.min[2] + a.max[2]) / 2, aYaw);
  const cb = rot2((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2, bYaw);
  const d = [bPos[0] + cb[0] - (aPos[0] + ca[0]), bPos[2] + cb[1] - (aPos[2] + ca[1])];
  const ha = [(a.max[0] - a.min[0]) / 2, (a.max[2] - a.min[2]) / 2];
  const hb = [(b.max[0] - b.min[0]) / 2, (b.max[2] - b.min[2]) / 2];
  const axes = [rot2(1, 0, aYaw), rot2(0, 1, aYaw), rot2(1, 0, bYaw), rot2(0, 1, bYaw)];
  const ua = [axes[0], axes[1]];
  const ub = [axes[2], axes[3]];
  for (const e of axes) {
    const proj = Math.abs(d[0] * e[0] + d[1] * e[1]);
    const ra = ha[0] * Math.abs(ua[0][0] * e[0] + ua[0][1] * e[1]) + ha[1] * Math.abs(ua[1][0] * e[0] + ua[1][1] * e[1]);
    const rb = hb[0] * Math.abs(ub[0][0] * e[0] + ub[0][1] * e[1]) + hb[1] * Math.abs(ub[1][0] * e[0] + ub[1][1] * e[1]);
    if (proj >= ra + rb - 0.05) return false;
  }
  return true;
}

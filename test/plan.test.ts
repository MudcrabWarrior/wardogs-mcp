import { test } from "node:test";
import assert from "node:assert/strict";
import { Catalog, loadDataset } from "../src/data.js";
import { decodePlan, encodePlan, findSnap, rowRun, validatePlan } from "../src/plan.js";
import { Editor } from "../src/editor.js";
import { snapKind, yawFromQuat } from "../src/math.js";

const cat = new Catalog(await loadDataset());

test("dataset has the core pieces", () => {
  for (const id of ["fob", "hblock", "tallhblock", "bremmerwall", "sandbagwall", "gate", "bunker", "l81-mortar", "stingray", "drillrig", "radio"]) {
    assert.ok(cat.get(id), `missing ${id}`);
  }
  assert.equal(cat.fobRange, 60);
});

test("codec round-trips the hand-tested plan", () => {
  const code = "|fob,hblock,l81-mortar|0,0,0,0,0;1,-525,0,600,0;1,-375,0,600,0;2,0,0,-600,90";
  const plan = decodePlan(code, cat);
  assert.equal(plan.pieces.length, 4);
  assert.deepEqual(plan.pieces[1].pos, [-5.25, 0, 6]);
  assert.equal(Math.round((plan.pieces[3].yaw * 180) / Math.PI), 90);
  assert.equal(encodePlan(plan), code);
});

test("codec keeps hidden parts and vehicle ids", () => {
  const code = "|bunker,v/land-wheeled-ural-default|0,-1815,0,-457,225,7;1,100,0,200,45";
  const plan = decodePlan(code, cat);
  assert.deepEqual(plan.pieces[0].hidden, [7]);
  assert.equal(plan.pieces[1].id, "v/land-wheeled-ural-default");
  assert.equal(encodePlan(plan), code);
});

test("hblock sockets classify as 4 sides, 1 top, 1 bottom", () => {
  const b = cat.get("hblock")!;
  const kinds = b.snaps.map((s) => snapKind(s.quat));
  assert.equal(kinds.filter((k) => k === "side").length, 4);
  assert.equal(kinds.filter((k) => k === "top").length, 1);
  assert.equal(kinds.filter((k) => k === "bottom").length, 1);
  assert.deepEqual(rowRun(b, cat), { axis: "x", step: 1.5 });
});

test("snap lands a second hblock exactly 1.5 m along x", () => {
  const b = cat.get("hblock")!;
  const plan = { world: null, pieces: [{ key: "a", id: "hblock", pos: [0, 0, 0] as [number, number, number], yaw: 0 }] };
  const hit = findSnap(plan, b, [1.4, 0, 0.1], 0, cat);
  assert.ok(hit);
  assert.ok(Math.abs(hit!.pos[0] - 1.5) < 1e-6 && Math.abs(hit!.pos[2]) < 1e-6, JSON.stringify(hit));
  assert.equal(hit!.parent, "a");
});

test("wall_run pieces share sockets and a ring closes without overlap", () => {
  const ed = new Editor(cat);
  ed.placeFob(0, 0);
  const run = ed.wallRun("hblock", -6, 10, 6, 10);
  assert.equal(run.count, 8);
  assert.equal(run.socketMatched, 7);
  const ring = ed.ring("hesco small", 0, 0, 12, { gapSide: "south", gate: "gate" });
  assert.ok(ring.gate);
  const issues = validatePlan(ed.plan, cat);
  const overlaps = issues.filter((i) => i.reason === "overlap");
  assert.equal(overlaps.length, 0, JSON.stringify(overlaps.slice(0, 3)));
  assert.equal(issues.filter((i) => i.reason === "range").length, 0);
});

test("validation flags pieces outside the FOB square and stack limits", () => {
  const ed = new Editor(cat);
  ed.placeFob(0, 0);
  ed.place("hblock", 70, 0, 0, 0, { snap: false });
  const keys = [ed.place("hblock", 3, 3, 0, 0, { snap: false }).piece.key];
  keys.push(...ed.stack(keys[0], 4));
  assert.throws(() => ed.stack(keys[keys.length - 1], 1));
  const issues = validatePlan(ed.plan, cat);
  assert.ok(issues.some((i) => i.reason === "range"));
  assert.equal(issues.filter((i) => i.reason === "stack").length, 0);
  const top = ed.get(keys[keys.length - 1])!;
  assert.ok(Math.abs(top.pos[1] - 4 * 1.494) < 0.02, String(top.pos[1]));
});

test("resolve accepts loose names", () => {
  assert.equal(cat.resolve("hesco small")?.id, "hblock");
  assert.equal(cat.resolve("mortar")?.id, "l81-mortar");
  assert.equal(cat.resolve("Bremmer Wall")?.id, "bremmerwall");
  assert.equal(Math.round((yawFromQuat([0, 0.707107, 0, 0.707107]) * 180) / Math.PI), 90);
});

test("ring gate seals the gap: both gate sockets meet wall sockets", () => {
  for (const half of [14, 12, 10.5]) {
    const ed = new Editor(cat);
    ed.placeFob(0, 0);
    const r = ed.ring("hesco small", 0, 0, half, { gapSide: "south", gate: "gate" });
    assert.equal(r.gapPieces, 4);
    assert.ok(r.gate?.snapped, `half ${half}: gate not sealed ${JSON.stringify(r.gate)}`);
    // every block, corners included, is socket-joined on both wall faces: exactly 2 open sockets
    const holes = ed.openSockets("hblock").filter((o) => o.open !== 2);
    assert.equal(holes.length, 0, `half ${half}: ${JSON.stringify(holes.slice(0, 4))}`);
    assert.equal(ed.floating().length, 0);
    assert.equal(validatePlan(ed.plan, cat).length, 0);
  }
});

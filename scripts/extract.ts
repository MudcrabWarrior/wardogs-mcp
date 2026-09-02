// Refresh data/buildables.json from wardogs.zone and print a short report.
import { loadDataset } from "../src/data.js";

const ds = await loadDataset({ refresh: true });
console.log(`source  ${ds.source}`);
console.log(`fetched ${ds.fetchedAt}`);
console.log(`fob range ${ds.fobRangeM} m`);
const kinds = new Map<string, number>();
for (const b of ds.buildables) kinds.set(b.kind, (kinds.get(b.kind) ?? 0) + 1);
for (const [k, n] of kinds) console.log(`${k.padEnd(14)} ${n}`);
console.log(`total ${ds.buildables.length}`);

# WARDOGS base building rules

Baseline rules every session must apply when planning a FOB in the wardogs.zone builder
via the wardogs MCP. These come from in-game experience and from Garen's WARDOGS base
video, "Build Better Bases - Star Fortress Fundamentals" by Get Gud with Garen
(https://www.youtube.com/watch?v=M7WH9QQeHZs), which covers Vauban / di Giorgio
principles. Where geometry forces a choice, the rule wins over
symmetry. Ask the user before breaking any of these.

## Site limits
- One FOB. Everything inside its 60 m square (x and z from -60 to +60). 1200 pieces max.
- Do not publish to the hub without review. Save with plan_save first.

## Player movement (game facts)
- Players vault onto single Hesco Small (1.5 m) and sandbags freely.
- Chained climbs work: from any raised point (a single Hesco, a sandbag, a hedgehog, a
  vehicle, terrain, random props) a player can jump and, if they clip the top edge of a
  taller piece, they vault it. A single Hesco next to a Hesco Large is a ladder over the
  Hesco Large. Treat any step of about 1.5 m as a ladder.
- Single-storey Bunkers (3 m) are easy to vault onto. Do not rely on a ground-level bunker
  as an unclimbable position.
- Barbed wire damages heavily but infantry can push through it. Vehicles cannot.
- Enemies cannot open Gates or Doors. Only the FOB owner's side can. Enemies must C4 them.
- Grenade throw is about 25 m. C4 can be thrown 10-15 m. Standoff must hold attackers
  25 m+ from anything valuable; C4 range means walls need 15 m of covered ground outside.

## Firing positions
- Defenders only get useful fire from raised positions (bunkers, towers, things stood on
  top of blocks). A standing player can see and shoot over a Hesco Small but not over a
  Hesco Large or Bremmer. Height advantage is the goal.
- Recon Towers (crowsnest, 7.6 m) are the "sniper bunkers": they are the corner bastions,
  projecting past both wall lines, ladder side facing INTO the base, doors on any open
  sections. They are preferred over Bunkers on wall corners because they cannot be vaulted
  onto.
- Bunkers: entry is through the three doorway openings only. Without a Door anyone vaults
  through; a fitted Door is C4-only for enemies. Friendlies must be able to reach every
  bunker from the compartment it is attached to. Freehand doors into every open doorway.
- Freehand placement is allowed and encouraged: a Bunker or a Talon SAM can sit on top of a
  Recon Tower; bunkers can sit on top of Hesco blocks. Snapping is a convenience, not a rule.

## Fortification principles (from Garen's video)
1. Defence in depth: FOB is the highest point at the centre. Three wall layers, each LOWER
   than the one behind it, so inner defenders fire over and down every outer layer.
   Capture as much of the 60 m square as possible.
2. Bastions on every corner, never mid-wall. Bastions project past both wall lines and
   rake the outer face of both walls they join. Bastions must support each other with
   raking fire; an isolated structure is a soon-lost structure. No rounded or recessed
   corners, no dead space where an attacker can hug a wall unseen.
3. Gates never on the base centre line and never in line with the next gate in. Offset
   each gate along its wall, next layer's gate on a different side. Every gate is covered
   by a firing position that clears the gate line without opening the gate.
4. Compartmentalisation: barbed wire runs straight out radially (along x and z) from one
   layer to the next so an attacker cannot rotate around the base hugging a wall. Never
   build a wall parallel to a defended wall that makes a pocket to hide in.
5. Open courtyards: no boxes inside boxes. Ground inside each ring stays open and visible.
   Wire around anything an enemy could hide behind, including the FOB. Exception: sandbag
   pits for expensive emplacements.
6. Standoff: ravelins in front of gates, hedgehogs and wire aprons on the approaches.
7. Doors on every bunker opening.

## Walls and layers
- A single Hesco Small ring is NOT a wall: vaultable from any side and it gives the
  attacker cover. Outer walls must be 3 m minimum (Hesco Wall 6 m piece, Hesco Large, or
  2-high Hesco Small), with corner bastions whose firing lines run down every wall so
  nobody can sit hard against it.
- Heights available: Bremmer 5.1, Recon Tower 7.6, Bunker 3, Hesco Wall 3.1, Hesco Large
  3.1, Hesco Small 1.5 (stacks 5), Sandbag 1, Wire 1.5, Hedgehog 1.9, Gate 6 m wide x 3 m,
  Door 1.5 m wide x 3 m, FOB 13 m.
- Every wall ring must pass perimeter_check with exactly 2 open sockets per piece except
  pieces next to a gate or bastion.

## Gates, doors, airlocks
- Airlocks are standard on every gate and door: always multiple doors, may be offset, and a
  defender must have visibility into the airlock pocket. Reason: when you open a door an
  enemy can be standing there; without an airlock they are straight into the next area.
- Personnel Doors go INLINE with the wall or wire run they belong to, in the middle of the
  run, never butted up against another wall (a door hard against a wall reads as part of
  the wall and nobody can use it).
- Trucks only need to reach a secure drop-off area just inside the outer wall, on the edge
  of the FOB radius. No vehicle airlock needed. Trucks-only pocket is fine, but personnel
  must be able to get into it to open the gate for the truck. Inner gates can be
  infantry-only. Wire stops vehicles, so no wire across the truck lane.

## Emplacements
- Mortars, CIWS, SAM, Stingray need open sky: not under or hard beside tall pieces.
- Do not group high-value emplacements; enemy artillery targets clusters. Spread them
  across quadrants, each in its own sandbag pit with wire on the outward side.

## Builder quirks (wardogs MCP + site)
- Bremmer Wall yaw: the ring tool lays Bremmers 90 deg wrong (broad face across the wall
  line, leaving gaps). Correct convention is Garen's: yaw 90 for a wall running along x,
  yaw 0/180 for a wall running along z. Rotate after ring, or use wall_run and check.
- wall_run centres pieces between its endpoints (endpoints are the run's outer faces, not
  piece centres). To get piece centres at a..b, run from a-pitch/2 to b+pitch/2.
- Bunker doorway sockets are the 'bottom' sockets at local (-2.56,0.10), (2.73,0.01),
  (0.04,2.73) (yaw -88, 88, 2). Snapping a Door to them misplaces it; freehand the door on
  the socket coordinates with snap=false. plan_status then reports 'door stands inside
  bunker' overlaps; that is expected for doorway doors.
- A projecting corner Bunker with 90 deg walls always has all three doorways outside the
  wall line (walls join 2.25 m from a face end, doorway is at face centre). Use a Recon
  Tower on corners, or set the bunker so one doorway is inside.
- The builder's status bar shows 'TOO CLOSE TO ANOTHER FOB' on the open pad because the
  site keeps a FOB ghost in hand; it is not a plan issue.
- Camera presets 1 and 2 frame only the citadel; use camera 'f' for the whole base.

## Workflow
- Build inside out: citadel, layer 2, layer 3, spokes, outer works.
- After every layer: plan_status, perimeter_check (filtered by piece), fix, browser_push,
  screenshot camera f plus 1 or 2, and look at the screenshots before continuing.
- Finish with plan_save, final plan_status, and a written walkthrough: what an attacker
  faces at each layer and which position covers each gate. Report piece count, supply
  total, and any rule not satisfied and why.

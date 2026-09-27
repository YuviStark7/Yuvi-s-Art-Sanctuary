# Improvements queue

This file is the work list for the daily improvement routine. It takes the
**first unchecked item under Queue**, implements that one thing, opens a pull
request, and moves the item to Done. It never merges anything.

**To steer it, edit this file.** Move an item to the top to get it next, add
your own in the same shape, or empty the Queue entirely to make the routine
stop proposing changes and only suggest.

Each item should say what to change and, crucially, **how to tell whether it
worked** — the routine runs in the cloud and cannot see the render, so it
depends on you to judge the result.

---

## Queue

### 1. Ambient occlusion in the room
**Read this before starting — a previous attempt failed and here is what it
found, so the next one does not repeat it.**

The hall is lit by a broad hemisphere light for overcast daylight, which leaves
corners and contact points looking flat. AO is still worth having. But:

`SSAOPass` from r185 was vendored and chained after `RenderPass` (which is the
correct position — it has `needsSwap = false` and multiplies into the read
buffer while the image is still linear). It produced **nothing**:

- The AO buffer (`pass.output = 1`) came back near-white at every kernel radius
  tried, from 0.42 m to 2.5 m.
- It stayed near-white with `minDistance = 0` and `maxDistance = 1`, i.e. with
  every depth delta accepted. That rules out mistuning.
- Its depth view (`pass.output = 3`) renders **flat white**, which says the
  depth texture it attaches to its own normal render target is not coming back
  usable. Its normal view (`output = 4`) does show correct normals.
- Ruled out MSAA: identical with `samples: 4` and `samples: 0`.

Two units traps worth knowing, whatever you try next:

- `kernelRadius` is in **view-space metres**.
- `minDistance` / `maxDistance` are **not** metres. They are normalised over
  `far - near`, so at the current `far = 60` one centimetre is `0.00017`. The
  addon's own defaults (`0.005` / `0.1`) mean 0.30 m and 6.0 m in this scene —
  workable now, where at the old `far = 220` they meant 1.1 m and 22 m, which is
  why they behaved nonsensically then.

So, in order:

1. The far plane has since come down to 60 m, which may well have been the
   underlying cause — so start by retrying the measurements above against it.
2. Retry `SSAOPass` with the corrected range, or try `GTAOPass`, which captures
   depth and normals differently.
3. If screen space keeps fighting back, **bake it instead**. The building never
   moves and its shadow map is already frozen, so vertex-colour AO costs
   nothing per frame — [`tools/extract-tree.mjs`](tools/extract-tree.mjs)
   already does exactly this for the canopy by tracing rays through a density
   grid. The catch is that the floor is currently a low-vertex disc, so it
   would need tessellating before the wall junction could show anything.

*How to judge it:* stand where the wall meets the floor, and look under the
concentric benches and at the pool lip. Those junctions should darken. If the
whole room turns muddy, the radius is too large.

### 2. Light through the blossom
The petals are opaque. Real blossom glows where the sun is behind it, and the
canopy sits directly under the oculus, which is the best possible place for the
effect.

Add a cheap translucency term to the `Blossom` material in
`buildImportedTree()` (`js/nature.js`) — a wrap-lighting or back-scatter tweak
via `onBeforeCompile`, not a full subsurface model. The petal colour is already
in vertex colours, so tint the back-scatter from that.

*How to judge it:* stand under the canopy and look up toward the oculus. Petals
between you and the light should warm and brighten at the edges.

### 3. Softer shadow edges
Shadows are currently a single hard-ish map. A PCSS-style or wider PCF filter
would suit overcast light much better — contact-sharp near the floor, soft
further away.

The shadow map is frozen (`renderer.shadowMap.autoUpdate = false`) because
nothing in the building moves, so extra filtering cost is paid once, not every
frame. Keep that property.

*How to judge it:* the shadow the dome casts on the floor through the skylights
should have a soft edge, and the tree's shadow on the island should stay crisp
where trunk meets rock.

### 4. Finer concrete up close
The concrete is procedural and convincing at a distance, but soft when you walk
up to a wall. Add a detail normal layered at a much higher frequency on top of
the existing triplanar projection, fading in as the camera gets close.

Do not simply raise the texture resolution — it is generated at load, so a
larger canvas costs start-up time on every visit.

*How to judge it:* walk right up to a wall between two artworks. It should
retain fine tooth rather than going smooth.

### 5. A loading screen worth the wait
The blossom tree is 4.3 MB and downloads behind the existing progress gate.
Right now "planting the tree" is a bare progress step. Make the wait feel
intentional rather than broken on a slow connection.

Nothing heavy — the gate already exists in `js/ui.js`.

*How to judge it:* throttle to Slow 3G in devtools and reload. It should read
as deliberate, never as a hang.

### 6. Real reflection and refraction in the pool
The water currently uses an analytic reflection — a pale dome with the oculus
punched into it — rather than a true reflection pass. Upgrade it, and add
caustics on the pool basin.

This is the most expensive item here. It must be **high preset only** and must
not regress the current 4.1 ms frame cost at medium.

*How to judge it:* the tree and the falling curtain should appear in the water,
and moving light should play across the basin floor.

---

## Done

*(the routine moves items here with a one-line note and the PR number)*

### The camera far plane is ten times too far away
`RENDER.far` 220 m → 60 m. The scene measures 21.3 m from the origin at its
furthest (the back wall of the deeper side chamber), so 60 m holds the whole
room with room to spare even from inside a chamber. (PR #1)

---

## Rules the routine follows

- One item per run. Never more.
- Branch `improve/<slug>`, pull request, **never merge, never push to main**.
- No build step, no npm dependencies, no CDN links. three.js stays vendored.
- Respect the three quality presets. Anything expensive is off or reduced at low.
- Never touch the brand placeholders in `js/wardrobe.js`, the keys in
  `js/payments.config.js`, or anything in `supabase/` unless an item says so.
- Say plainly in the PR what it could not verify, because it cannot see the
  render.

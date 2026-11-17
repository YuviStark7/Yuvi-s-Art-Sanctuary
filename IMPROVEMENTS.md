# Improvements queue

This file is the work list for the daily improvement routine. It takes the
**first unchecked item under Queue**, implements that one thing, merges it into
`main` itself, and moves the item to Done.

**To steer it, edit this file.** Move an item to the top to get it next, add
your own in the same shape, or empty the Queue entirely to make the routine
stop proposing changes and only suggest.

Each item should say what to change and, crucially, **how to tell whether it
worked** — the routine runs in the cloud and cannot see the render, so it
depends on you to judge the result. It is now merging that unverified work
straight to the published site, so read the Done notes.

---

## Queue

### 1. Softer shadow edges
Shadows are currently a single hard-ish map. A PCSS-style or wider PCF filter
would suit overcast light much better — contact-sharp near the floor, soft
further away.

The shadow map is frozen (`renderer.shadowMap.autoUpdate = false`) because
nothing in the building moves, so extra filtering cost is paid once, not every
frame. Keep that property.

*How to judge it:* the shadow the dome casts on the floor through the skylights
should have a soft edge, and the tree's shadow on the island should stay crisp
where trunk meets rock.

### 2. A loading screen worth the wait
The blossom tree is 4.3 MB and downloads behind the existing progress gate.
Right now "planting the tree" is a bare progress step. Make the wait feel
intentional rather than broken on a slow connection.

Nothing heavy — the gate already exists in `js/ui.js`.

*How to judge it:* throttle to Slow 3G in devtools and reload. It should read
as deliberate, never as a hang.

## Parked — do not start

Both of these add per-frame GPU cost, and the site is currently being made
lighter. They come back once frame time has headroom again.

### Finer concrete up close
The concrete is procedural and convincing at a distance, but soft when you walk
up to a wall. Add a detail normal layered at a much higher frequency on top of
the existing triplanar projection, fading in as the camera gets close.

Do not simply raise the texture resolution — it is generated at load, so a
larger canvas costs start-up time on every visit.

*How to judge it:* walk right up to a wall between two artworks. It should
retain fine tooth rather than going smooth.

### Real reflection and refraction in the pool
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

### The figures, replaced
The procedural figure — an egg with a decal face, a bowl for hair, a tube for a
neck — could not be repaired into something that looks real, so it is replaced
by a man and a woman built from CC0 MakeHuman parts (`tools/human/`): modelled
head and hands, real hair, brows and lashes, and tailored formal wear (white
dinner jacket, navy suit; double-breasted suit, skirt suit). `js/character.js`
loads them; the old figure is `js/character.procedural.js` and takes over if
the model cannot be fetched. **Do not edit the `.glb` files by hand**, and do not try to
rebuild them: the source assets are git-ignored, so a cloud checkout cannot run
`tools/human/build.mjs` at all. Changes to the figures are made on a machine that
has fetched them (see `tools/human/README.md`).

### Keep the frame rate smooth
`js/governor.js` measures frame intervals and sheds cost in steps (resolution,
bloom, canopy, floor reflection) when frames run long, and probes back up when
there is room. Bloom runs at half resolution and every shader is compiled behind
the loading screen. **Anything added to the render path should be cheap**: on a
GTX 1650 at 1080p the frame is 11.7 ms at full quality, of which the concrete
shell is 4.0, bloom 2.0, the floor reflection 1.9, the canopy 1.4 and the figure
1.5. The two parked items below add cost and stay parked until the governor
has been seen to hold.

### Make the figure probe read the figure, not a copy of it
The figure's measurements moved into `js/figure.metrics.js`, which
`js/character.js` builds from and `tools/probe-figure.mjs` measures with, so
there is one copy of them and not two. The probe's two hand rows fall from
266 mm to nothing, as predicted, and it now refuses to run rather than measure
a figure nobody ships. `tools/rig-figure.mjs` still keeps its own copy. (PR #13)

### Keep the camera inside the building
The arm is tested along its whole length instead of only at its end, and
measured out from the figure's shoulder line instead of from the pivot, so it
can neither reach a side chamber through the wall nor hang off a pivot the
shoulder offset has already pushed outside. Clearance is the near plane's own
reach, read from the camera. Over 9.0 M sampled poses the camera left the
sanctuary on 7.82% before and none after. Against a wall, where no length of
arm is legal, it now collapses to about 0.19 m and the camera sits inside the
figure — better than the void it replaced, but **not yet looked at on screen**;
`CAMERA.clearance` and `CAMERA.probeStep` tune it without a revert. (PR #12)

### The figure's hands, and the mirrored chest print
Hands carried out to the wrists (PR #8), chest print and face patch unmirrored
(PR #9), the upper arm's buried flank moved out of the chest (PR #11). The
reported face reversal was never reproduced and the arm overlap is only halved,
so the item stays in the Queue, trimmed to what is left of it.

### A way to measure the figure without a browser
`tools/probe-figure.mjs` rebuilds the skeleton and the limb tubes, drives them
through the walk cycle with the vendored three.js, and reports every vertex
that is inside the body at rest and outside it mid-stride. Nothing in the
published site changes — `tools/` is not loaded by `index.html`. It arrived
restating `js/character.js`'s numbers instead of importing them, and had
already drifted from them; PR #13 gave both files one copy to read. (PR #10)

### Light through the blossom
Back-scatter on the `Blossom` material, added by overriding `RE_Direct` from
`onBeforeCompile`, so each light contributes once and arrives already
attenuated by the frozen shadow map — which is what keeps the buried interior
of the crown dark while the lit outer petals glow. High and medium; off at low
via `canopyTranslucency`. Chosen over PR #6, which lit the whole canopy
evenly, after rendering both headless and comparing. (PR #7)

### Ambient occlusion in the room
Solved in closed form instead of in screen space: the room is a known shape, so
`makeRoomOcclusion()` darkens the ambient term analytically per fragment from
the floor, the wall, the basin and the seating arcs. No geometry change, no
bake, nothing vendored. High and medium; off at low. (PR #4 — and note that
PRs #2 and #3 are still open against this same item, by two other routes.)

### The camera far plane is ten times too far away
`RENDER.far` 220 m → 60 m. The scene measures 21.3 m from the origin at its
furthest (the back wall of the deeper side chamber), so 60 m holds the whole
room with room to spare even from inside a chamber. (PR #1)

---

## Rules the routine follows

- One item per run. Never more.
- Branch `improve/<slug>`, then **merge it into `main` itself**. No pull
  request, no review, no waiting. The branch is still how the work is built, so
  a bad run stays one `git revert` away.
- No build step, no npm dependencies, no CDN links. three.js stays vendored.
- Respect the three quality presets. Anything expensive is off or reduced at low.
- Never touch the brand placeholders in `js/wardrobe.js`, the keys in
  `js/payments.config.js`, or anything in `supabase/` unless an item says so.
- Say plainly in the commit message what it could not verify, because it cannot
  see the render — and it is now merging that unverified work straight to the
  published site, so that note is the only warning anyone gets.

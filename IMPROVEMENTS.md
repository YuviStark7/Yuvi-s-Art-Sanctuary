# Improvements queue

This file is the work list for the daily improvement routine. It takes the
**first unchecked item under Queue**, implements that one thing, and opens a pull
request for it. It never merges and never pushes to `main`; the item moves to
Done when the PR is merged.

**To steer it, edit this file.** Move an item to the top to get it next, add
your own in the same shape, or empty the Queue entirely to make the routine
stop proposing changes and only suggest.

Each item should say what to change and, crucially, **how to tell whether it
worked** — the routine runs in the cloud and cannot see the render, so it
depends on you to judge the result. Its work reaches the published site only
when you merge the PR, so read the PR's "could not verify" notes first.

---

## Queue

*(empty — add an item above the Parked ones to give the routine something to do)*

## Parked — do not start

Both of these add per-frame GPU cost, and the site is currently being made
lighter. They come back once frame time has headroom again.

### Real reflection and refraction in the pool
The water currently uses an analytic reflection — a pale dome with the oculus
punched into it — rather than a true reflection pass. Upgrade it. (The caustics
on the basin are done; see Done.)

This is the most expensive item here. It must be **high preset only** and must
not regress the current 4.1 ms frame cost at medium.

*How to judge it:* the tree and the falling curtain should appear in the water,
and moving light should play across the basin floor.

---

## Done

*(the routine moves items here with a one-line note and the PR number)*

### Grain on the wall, up close
Within about 4.5 m the wall's photograph is read again at 0.5 m and turned into
relief by screen-space derivatives (`addDetailNormal` in `js/architecture.js`,
tuned by `CONCRETE_DETAIL`; off at the low preset). It replaces the old
"detail normal" idea, which assumed the plaster shipped a normal map worth
using: it does not, its relief is a standard deviation of about one level in
255. Measured on the wall at 1280x960 the cost is within noise (about 5.2 to
6.3 ms either way). Seen once, with the strength at 3; look at it walking
along a wall and say if it reads as plaster or as felt.

### The room's surfaces, light and planting
The wall, floor and rock are Poly Haven photographs (CC0), fetched and graded by
`tools/room/fetch.mjs` into `textures/*.webp` — nothing is downloaded at runtime,
and a missing file falls back to the old generated surface. The wall's broad
blotches are filtered out at build time so the 1 m tile does not band across the
dome, and the shader adds a slow world-space mottle instead. The sun's pools of
light are dappled by a tiling leaf cookie (`makeSunDapple`, one texture read, floor
only) and have soft edges (`sun.shadow.radius`; PCF takes five taps whatever the
radius). The environment probe no longer sees the pink canopy, which was tinting the
whole hall mauve. The island carries the rock photograph, 26 instanced ferns
(`models/fern.glb`, built by `tools/room/fern.mjs`) planted by raycast, and the water
is clear enough to show the basin, whose bed carries animated caustics
(`makeCaustics`). The fill light and exposure came down a little so the new surfaces
keep their contrast. Measured cost is in the README under *Staying smooth*. This
also closes the old "Softer shadow edges" item, with one regression: the contact
shadow where the trunk meets the rock is no longer crisp.

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

### A loading screen worth the wait
The tree was the only step that could ever be a real wait, and it was the one
step that said the least: the bar crawled through six per cent of its width
for however long 4.3 MB took, and said nothing at all when the server sent no
content length to crawl against. It now accounts for itself — the megabytes as
they land, the subject when none have, and that the room opens without the
tree either way — but only after `LOADING.patience` seconds, so a fast visit
never sees it. Where there is no content length and so no honest fraction to
draw, the bar sweeps rather than standing still. `LOADING.patience` to
Infinity and `LOADING.sweep` to false give the old screen back exactly.
**Not looked at on screen** — the copy, the spacing of the second line and the
sweep on a one-pixel rule are all unseen. (PR #16)

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
- Branch `improve/<slug>`, then **open a pull request**. Never merge it, never
  push to `main`: the owner reviews and merges. The branch keeps a bad run one
  `git revert` away.
- No build step, no npm dependencies, no CDN links. three.js stays vendored.
- Respect the three quality presets. Anything expensive is off or reduced at low.
- Never touch the brand placeholders in `js/wardrobe.js`, the keys in
  `js/payments.config.js`, or anything in `supabase/` unless an item says so.
- Say plainly in the commit message what it could not verify, because it cannot
  see the render — and it is now merging that unverified work straight to the
  published site, so that note is the only warning anyone gets.

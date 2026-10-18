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

### 1. Fix the figure — what is left of it
Three faults were reported together. Two are now fixed and one was never
reproduced, so this item stays open until the figure is looked at on screen.

- **Hands on the wrong sides — fixed (PR #8).** `_handGeometry()` built both
  hands on the centre line and never carried them out to the wrist, so a rigid
  bind to `wrist<side>` left each hand 183 mm on the far side of its own wrist,
  buried in the pelvis and sweeping out through it twice a stride.
- **Chest print mirrored — fixed (PR #9).** The print's `u` ran from the
  figure's left to its right, so every logo was printed back to front. The face
  patch was unmirrored in the same pass; that half is a no-op today, because
  `faceTexture()` draws one eye and mirrors it.
- **Face reversed — not reproduced.** No fault was ever found. The suspicion is
  that it was the hands all along: a figure whose hands are on the wrong sides
  reads as turned around. **Check this first, now that PR #8 has landed.**
- **Arms through the body — improved, not solved (PR #11).** `ARM_CLEARANCE`
  moved the upper arm's buried flank out of the chest, halving the seam from
  17.0 mm over 12 vertices to 9.7 mm over 6. What remains is a bind-pose
  overlap that PR #10's probe says no weighting can fix.

*How to judge it:* walk the figure toward you and away again, dressed in each
top. Its face should read as facing where it walks, its right hand should stay
on your left, and its arms should swing clear of its hips from every angle. If
any of that is still wrong, say which — these are no longer one fault.

### 2. Make the figure probe read the figure, not a copy of it
`tools/probe-figure.mjs` restates the constants in `js/character.js` by hand
instead of importing them, and the two have already drifted. The probe still
places the arm at `s * X.shoulder` and authors the hand on the centre line, so
it measures the figure as it was *before* PRs #8 and #11. Run it today and it
reports the hands 266 mm out of the body, which is no longer true — the tool
bought to check the figure now lies about it.

Import the shared numbers from `js/character.js` rather than restating them, or
lift them into a small module both files import. Either way the probe must fail
loudly if a constant it depends on disappears, rather than quietly measuring a
figure nobody ships.

*How to judge it:* run `node tools/probe-figure.mjs`. The two hand rows should
fall to nothing, because the hands are fixed. Whatever is still listed is real,
and is the arm overlap item 1 leaves open.

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

### 4. A loading screen worth the wait
The blossom tree is 4.3 MB and downloads behind the existing progress gate.
Right now "planting the tree" is a bare progress step. Make the wait feel
intentional rather than broken on a slow connection.

Nothing heavy — the gate already exists in `js/ui.js`.

*How to judge it:* throttle to Slow 3G in devtools and reload. It should read
as deliberate, never as a hang.

### 5. Real reflection and refraction in the pool
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

### Finer concrete up close
The same normal map the wall already carries is projected a second time at
half a metre across and added to the shading normal, so the concrete keeps a
tooth at arm's length. Nothing new is generated at load and nothing is
downloaded: the map was built for the wall and was not being read at all,
since the triplanar patch owns the map and roughness hooks and never set up a
normal. The three extra reads sit behind the fade, so a wall across the room
issues none of them. High and medium; off at low via `concreteDetail`, and
`CONCRETE_DETAIL` in `js/config.js` sets the tile, the strength and the two
fade distances without a revert — `strength: 0` turns it off everywhere.
**Not yet looked at on screen**, and the thing most likely to be wrong is the
amount: 0.55 of the map's slope may read as sandpaper rather than as concrete.
(PR #15)

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
published site changes — `tools/` is not loaded by `index.html`. It restates
`js/character.js`'s numbers instead of importing them and has already drifted
from them, which is now item 2 in the Queue. (PR #10)

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

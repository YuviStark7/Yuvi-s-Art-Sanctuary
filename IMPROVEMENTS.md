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

### 1. Fix the figure — handedness, face and arms
**This is the owner's first concern.** Three things are wrong with the figure
at once, and they may well be one fault rather than three:

- its **hands are on the wrong sides**,
- its **face is reversed** — it reads as facing the wrong way,
- its **arms pass in and out of the body** as it walks.

Nothing here is diagnosed yet, so **start by reproducing it on screen**, not by
reading. Walk the figure, and watch it from the front, from behind and in the
wardrobe at the door.

What has already been checked, so the next run does not repeat it — all three
of these came out **consistent**, and none of them is the fault:

- Forward is `-Z` throughout: `js/player.js` turns the figure with
  `Math.atan2(-dirX, -dirZ)`, which maps local `-Z` onto the heading.
- Left is `-X`: `js/character.js` builds every limb from
  `side === 'L' ? -1 : 1`, which is correct for a figure facing `-Z`.
- The face patch is built on the `-Z` side of the skull (`_faceGeometry()`,
  where `z` is negative), so it is on the same side as the forward direction.
- The painted face is **left-right symmetric** — `faceTexture()` in
  `js/textures.js` draws one eye and mirrors it — so flipping the face patch's
  `u` coordinate would change nothing. The reversed face is not a mirrored
  texture.

So look instead for an extra half-turn somewhere between the skeleton, the
root and whatever drives it, and for the arm fault in `skinChain()` and the
garment tubes `_wear()` builds — an arm that passes through the torso is
usually a bind-pose or weighting problem, not an animation one.

*How to judge it:* walk toward a mirror-flat wall and then away from it. The
figure should face where it is going, its right hand should stay on your left
while it walks toward you, and its arms should swing clear of its hips from
every angle. Check it dressed in each top, because the garment tubes are
bound separately from the body.

### 2. Keep the camera inside the building
Walk up to a wall, then pan or pull the camera back, and past a certain angle
the camera leaves the sanctuary and you see pitch black.

The black is `scene.background` (`0x0d0d0c`): the shell is `side:
THREE.FrontSide`, so the moment the camera crosses it the concrete stops being
drawn and there is nothing behind it.

Two things in `updateCamera()` and `_cameraFits()` (`js/player.js`) look like
the cause:

- The shortening loop gives up with `d <= CAMERA.minDistance * 0.6` — about
  0.78 m — and takes that distance **whether or not the position is legal**.
  Stand close enough to a wall and no distance on the arm fits, so an illegal
  one is used.
- `_cameraFits()` tests the camera's **point only**. It does not test the near
  plane, which stands 0.06 m in front of it with corners about 0.09 m out, and
  it does not test the segment from the pivot to the camera — so an arm can
  pass through concrete and land somewhere legal on the far side.

Keep the clamp analytic, the way the README describes it; this does not need a
raycast. If no length on the arm is legal, the arm should collapse to its
minimum and stay inside rather than give up.

*How to judge it:* walk into every wall of the hall and both side chambers,
and at each one pan all the way round and pull the camera fully out and fully
in. The concrete should never disappear and no black should ever show. Then
stand in a doorway and do it again — that is the hardest case, because a
legal chamber sits directly behind a legal hall.

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
- Branch `improve/<slug>`, pull request, **never merge, never push to main**.
- No build step, no npm dependencies, no CDN links. three.js stays vendored.
- Respect the three quality presets. Anything expensive is off or reduced at low.
- Never touch the brand placeholders in `js/wardrobe.js`, the keys in
  `js/payments.config.js`, or anything in `supabase/` unless an item says so.
- Say plainly in the PR what it could not verify, because it cannot see the
  render.

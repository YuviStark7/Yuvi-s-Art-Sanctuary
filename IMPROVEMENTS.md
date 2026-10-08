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

### 1. The figure's face reads as facing the wrong way
What is left of the owner's first concern. Two of its three parts turned out to
be one fault and are fixed: the hand meshes were authored on the body's centre
line and bound rigidly to the wrists, so each hand sat in the hips on the far
side of the figure from its own arm, and swung through the pelvis as the arms
swung. **Judge that first** — a figure with both hands crossed into its lap may
well have been the whole of why it read wrong, in which case delete this item.

If it still reads reversed once the hands are right, here is the ground already
covered, so that no run repeats it. All of this came out **consistent**:

- Forward is `-Z` throughout: `js/player.js` turns the figure with
  `Math.atan2(-dirX, -dirZ)`, which maps local `-Z` onto the heading, and
  `main.js` sets `character.root.rotation.y = player.facing`.
- Left is `-X`, which is correct for a figure facing `-Z` with `+Y` up, and
  `js/character.js` builds every limb from `side === 'L' ? -1 : 1`.
- The face patch is built on the `-Z` side of the skull (`_faceGeometry()`),
  and so are the chin, the toes, the shoe, the cap's peak and the chest print;
  the back of the skull and the longer hair are on `+Z`.
- The painted face is **left-right symmetric** — `faceTexture()` in
  `js/textures.js` draws one eye and mirrors it — so flipping the face patch's
  `u` coordinate would change nothing.
- The wardrobe turntable is right too: at the door `placeForWardrobe()` sets
  `facing = Math.PI` and the camera starts on the `+Z` side, so it is the face
  you are shown, with the figure's right hand on your left.
- three.js is not double-applying the root's yaw. `_skinned()` binds with an
  identity `bindMatrix`, but the default attached bind mode recomputes
  `bindMatrixInverse` from `matrixWorld` every frame, which cancels it.

One thing found and **not** fixed, because it is a separate fault and the queue
takes one item at a time: `_buildChestGraphic()` maps `u = 0` to the figure's
left, so a brand print on the chest comes out mirrored. The face patch shares
that convention and gets away with it only because the painting is symmetric.

*How to judge it:* walk toward a wall and then away from it, and look at the
figure from the front, from behind, and on the turntable at the door. If it
reads right now, delete this item.

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

### 3. Light through the blossom
The petals are opaque. Real blossom glows where the sun is behind it, and the
canopy sits directly under the oculus, which is the best possible place for the
effect.

Add a cheap translucency term to the `Blossom` material in
`buildImportedTree()` (`js/nature.js`) — a wrap-lighting or back-scatter tweak
via `onBeforeCompile`, not a full subsurface model. The petal colour is already
in vertex colours, so tint the back-scatter from that.

*How to judge it:* stand under the canopy and look up toward the oculus. Petals
between you and the light should warm and brighten at the edges.

### 4. Softer shadow edges
Shadows are currently a single hard-ish map. A PCSS-style or wider PCF filter
would suit overcast light much better — contact-sharp near the floor, soft
further away.

The shadow map is frozen (`renderer.shadowMap.autoUpdate = false`) because
nothing in the building moves, so extra filtering cost is paid once, not every
frame. Keep that property.

*How to judge it:* the shadow the dome casts on the floor through the skylights
should have a soft edge, and the tree's shadow on the island should stay crisp
where trunk meets rock.

### 5. Finer concrete up close
The concrete is procedural and convincing at a distance, but soft when you walk
up to a wall. Add a detail normal layered at a much higher frequency on top of
the existing triplanar projection, fading in as the camera gets close.

Do not simply raise the texture resolution — it is generated at load, so a
larger canvas costs start-up time on every visit.

*How to judge it:* walk right up to a wall between two artworks. It should
retain fine tooth rather than going smooth.

### 6. A loading screen worth the wait
The blossom tree is 4.3 MB and downloads behind the existing progress gate.
Right now "planting the tree" is a bare progress step. Make the wait feel
intentional rather than broken on a slow connection.

Nothing heavy — the gate already exists in `js/ui.js`.

*How to judge it:* throttle to Slow 3G in devtools and reload. It should read
as deliberate, never as a hang.

### 7. Real reflection and refraction in the pool
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

### The figure's hands were in its hips, not on its arms
`_handGeometry()` authored the hand on the centre line and `skinTo()` bound it
rigidly to the wrist, which keeps a vertex exactly where it was authored — so
both hands sat buried in the pelvis, each on the opposite side from its own
arm, and swept through it as the arms swung. Carried out to `s * X.shoulder`,
the way the foot already sits out on `s * X.leg`. (PR #PRNUM — the reversed
face was not explained by this and stays in the Queue.)

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

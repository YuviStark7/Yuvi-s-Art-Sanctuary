# tools/human — building the figures

Offline. The browser never sees a MakeHuman file; it loads the two `.glb`s this
makes. Needs Node 20+ and `ffmpeg` on the PATH.

```bash
# 1. fetch the source assets into "3D Objects/makehuman-src/" (git-ignored, ~110 MB)
node tools/human/fetch-base.mjs                 # base mesh, rig, weights, macro targets, eye mesh
node tools/human/fetch.mjs suits01              # the suits
node tools/human/fetch.mjs makehuman_system_assets "^(eyes|eyelashes|eyebrows|skins/young_caucasian_(male|female)2?/|hair/(short0[1-4]|bob0[12]|ponytail01|long01|braid01)/|clothes/shoes0[1-6]/)"

# 2. build
node tools/human/build.mjs male
node tools/human/build.mjs female
```

**The figures cannot be rebuilt from a bare checkout**, nor by the scheduled cloud
routine: the sources above are git-ignored (they are large and not ours to
republish), so rebuilding means running step 1 first. The built `.glb`s in
`models/` are what the site loads and are committed.

`ls.mjs <pack> [regex]` lists a pack's contents without downloading it.

| file | what it is |
|---|---|
| `characters.mjs` | **the place to edit**: which body, hair, brows, eyes, shoes and outfits |
| `build.mjs` | morph, re-pose, fit, skin, place, quantize, write the `.glb` |
| `rig.mjs` | joints from the morphed body; the A-pose to hanging-pose settling; 163 bones to 49 |
| `mhclo.mjs` | MakeHuman proxy files: how a garment is anchored to the body |
| `mh.mjs` | the base mesh, morph targets, geometry assembly |
| `tex.mjs` | WebP encoding, alpha-edge bleed, average colours (via ffmpeg) |
| `remotezip.mjs` | read single files out of a remote zip with HTTP range requests |

Environment overrides for quick comparisons: `HAIR=short03 SUFFIX=-a node tools/human/build.mjs male`
writes `models/figure-male-a.glb` with another hairstyle.

Everything here is CC0 (MakeHuman's base and system assets; Margaret Toigo's suits).

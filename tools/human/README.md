# tools/human — building the figures

Offline. The browser never sees a MakeHuman file; it loads the two `.glb`s this
makes. Needs Node 20+ and `ffmpeg` on the PATH.

```bash
# 1. fetch the source assets (single files out of the big packs; ~100 MB total)
node tools/human/fetch.mjs suits01
node tools/human/fetch.mjs makehuman_system_assets "^(eyes|eyelashes|eyebrows|skins/young_caucasian_(male|female)2?/|hair/(short0[1-4]|bob0[12]|ponytail01|long01|braid01)/|clothes/shoes0[1-6]/)"
# plus the base mesh, rig and macro targets from the MakeHuman repo into
# "3D Objects/makehuman-src/" (base.obj, default.mhskel, default_weights.mhw,
# targets/<race>-<gender>-young.target, eyes/high-poly.*), see mh.mjs

# 2. build
node tools/human/build.mjs male
node tools/human/build.mjs female
```

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

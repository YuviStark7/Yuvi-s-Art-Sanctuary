/**
 * The figure's measurements, and the shapes that follow from them.
 *
 * `js/character.js` builds the figure out of these numbers and
 * `tools/probe-figure.mjs` measures it against them. They used to be written
 * twice, once in each file, and the two copies drifted: three fixes to the
 * figure landed and the probe went on measuring the figure as it had been
 * before them, which made the one tool bought to check the figure the least
 * trustworthy thing about it.
 *
 * So this file is the only place the figure is described. Nothing here imports
 * three.js or touches a document, which is what lets the same numbers load in
 * the browser and in Node without a build step of any kind.
 */

/* -------------------------------------- the figure, in metres off the floor */

export const Y = {
  hips: 0.95, spine: 1.09, chest: 1.26, neck: 1.44, head: 1.615,
  shoulder: 1.41, elbow: 1.13, wrist: 0.88,
  knee: 0.51, ankle: 0.09
};
export const X = { shoulder: 0.183, leg: 0.084 };

/** Bone order. Each name's index is its slot in the skeleton. */
export const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'elbowL', 'wristL',
  'shoulderR', 'elbowR', 'wristR',
  'hipL', 'kneeL', 'ankleL',
  'hipR', 'kneeR', 'ankleR'
];
export const B = {};
BONES.forEach((n, i) => { B[n] = i; });

/** Which bones drive which stretch of the body, root outward. */
export const CHAINS = {
  torso: [
    { bone: B.hips, y: Y.hips }, { bone: B.spine, y: Y.spine },
    { bone: B.chest, y: Y.chest }, { bone: B.neck, y: Y.neck }
  ],
  head: [{ bone: B.neck, y: Y.neck }, { bone: B.head, y: Y.head }],
  armL: [
    { bone: B.shoulderL, y: Y.shoulder }, { bone: B.elbowL, y: Y.elbow },
    { bone: B.wristL, y: Y.wrist }
  ],
  armR: [
    { bone: B.shoulderR, y: Y.shoulder }, { bone: B.elbowR, y: Y.elbow },
    { bone: B.wristR, y: Y.wrist }
  ],
  legL: [
    { bone: B.hipL, y: Y.hips }, { bone: B.kneeL, y: Y.knee },
    { bone: B.ankleL, y: Y.ankle }
  ],
  legR: [
    { bone: B.hipR, y: Y.hips }, { bone: B.kneeR, y: Y.knee },
    { bone: B.ankleR, y: Y.ankle }
  ]
};

/** How wide a joint's blend is, per chain. A limb needs a narrower one than
 *  the torso, because its joints are closer together. */
export const BAND = { torso: 0.13, arm: 0.085, leg: 0.10 };

/* ----------------------------------------------------------- body shapes -- */

export const TORSO = [
  { y: 0.828, rx: 0.144, rz: 0.104 },
  { y: 0.878, rx: 0.155, rz: 0.111 },
  { y: 0.930, rx: 0.158, rz: 0.113 },
  { y: 1.010, rx: 0.141, rz: 0.100 },
  { y: 1.110, rx: 0.132, rz: 0.094 },
  { y: 1.190, rx: 0.140, rz: 0.099 },
  { y: 1.270, rx: 0.156, rz: 0.107 },
  { y: 1.345, rx: 0.166, rz: 0.111 },
  { y: 1.408, rx: 0.157, rz: 0.102 },
  { y: 1.448, rx: 0.116, rz: 0.088 }
];

const ARM_STOPS = [
  { y: Y.shoulder + 0.03, r: 0.055 },
  { y: Y.elbow, r: 0.0425 },
  { y: Y.wrist, r: 0.0335 }
];

const LEG_STOPS = [
  { y: Y.hips + 0.02, r: 0.0855 },
  { y: Y.knee, r: 0.0615 },
  { y: Y.ankle, r: 0.0425 }
];

/**
 * How far the upper arm's inboard flank is moved out of the chest.
 *
 * The arm hangs beside a ribcage of nearly its own width, so the flank facing
 * the body sits a few millimetres inside the chest the whole way down. A few
 * millimetres would be harmless — buried is simply hidden — but the shoulder
 * swings far enough to carry that flank out through the skin of the shirt and
 * back in twice a stride, and it is the moving seam, not the burial, that
 * reads as an arm passing through the body.
 *
 * Clearing the arm outright would take thirty millimetres more shoulder width,
 * which is a different figure. This moves the flank alone: the tube is shifted
 * outboard and loses the same off its own `rx`, so the arm's outer edge and
 * its depth stay exactly where they were and only the buried side moves.
 */
export const ARM_CLEARANCE = 0.010;

/** Where the arm's tube and the hand are authored, sideways. The hand follows
 *  the arm's own line rather than the wrist bone's, because the clearance
 *  moved the tube outboard and the bone stayed where it was. */
export const ARM_OFFSET = X.shoulder + ARM_CLEARANCE;

/** How far a garment stands off the body it covers. */
export const PAD = { top: 0.021, seat: 0.013 };

/** How finely each tube is cut around its circumference. */
export const RADIAL = { arm: 18, leg: 20, sleeve: 18, trouser: 22 };

/**
 * The hand's parts, laid out on the centre line, for `js/character.js` to
 * build and carry out to the arm's line. `x` and `tilt` are signed by the
 * side; everything else is the same on both.
 */
export const HAND = {
  palm:    { slab: [0.070, 0.062, 0.031, 0.014], segs: 3, y: Y.wrist - 0.034, z: 0 },
  fingers: { slab: [0.066, 0.062, 0.027, 0.013], segs: 3, y: Y.wrist - 0.092, z: 0.002 },
  thumb:   { slab: [0.024, 0.046, 0.024, 0.011], segs: 2, y: Y.wrist - 0.052, z: 0.008,
             x: -0.030, tilt: 0.55 },
  grooves: { radius: 0.0032, length: 0.058, y: Y.wrist - 0.096, z: -0.014,
             x: [-0.021, 0.021] }
};

/* ------------------------------------------------------- derived sections -- */

/** Builds a limb's section stack between height stops, with a mid bulge. */
function taper(stops, bulge) {
  const secs = [];
  const span = stops[stops.length - 1].y - stops[0].y || 1;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    const steps = 4;
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const y = a.y + (b.y - a.y) * t;
      let r = a.r + (b.r - a.r) * t;
      if (bulge) r *= 1 + Math.sin(((y - stops[0].y) / span) * Math.PI) * bulge;
      secs.push({ y, rx: r, rz: r * 0.93 });
    }
  }
  const last = stops[stops.length - 1];
  secs.push({ y: last.y, rx: last.r, rz: last.r * 0.93 });
  return secs.sort((p, q) => p.y - q.y);
}

/**
 * Takes `ARM_CLEARANCE` off a section stack's `rx`, fading to nothing at the
 * elbow. Below there the arm is already clear of the chest, and the forearm is
 * seen from every angle, so it is left exactly as it was.
 */
function clearInboardFlank(sections) {
  return sections.map((s) => {
    const k = Math.max(0, Math.min(1, (s.y - Y.elbow) / 0.06));
    return { y: s.y, rx: s.rx - ARM_CLEARANCE * k, rz: s.rz };
  });
}

/** Grows a copy of a section stack outward, for a garment over a body part. */
export function inflate(sections, pad, from, to) {
  return sections
    .filter((s) => s.y >= (from === undefined ? -9 : from) && s.y <= (to === undefined ? 9 : to))
    .map((s) => ({ y: s.y, rx: s.rx + pad, rz: s.rz + pad }));
}

/** The section stack, read at any height. */
export function sectionAt(sections, y) {
  if (y <= sections[0].y) return { rx: sections[0].rx, rz: sections[0].rz };
  const last = sections[sections.length - 1];
  if (y >= last.y) return { rx: last.rx, rz: last.rz };
  for (let i = 1; i < sections.length; i++) {
    if (y > sections[i].y) continue;
    const a = sections[i - 1], b = sections[i];
    const k = (y - a.y) / (b.y - a.y || 1);
    return { rx: a.rx + (b.rx - a.rx) * k, rz: a.rz + (b.rz - a.rz) * k };
  }
  return { rx: last.rx, rz: last.rz };
}

/** The bare arm, flank already cleared. Authored at `ARM_OFFSET`. */
export function armSections() {
  return clearInboardFlank(taper(ARM_STOPS, 0.05));
}

/** The bare leg. Authored at `X.leg`. */
export function legSections() {
  return taper(LEG_STOPS, 0.055);
}

/** Where a sleeve stops: at the wrist if it is long, mid upper arm if short. */
export function sleeveEnd(long) {
  return long ? Y.wrist + 0.028 : Y.shoulder - 0.150;
}

/**
 * A sleeve, long or short. Authored at `X.shoulder` rather than the arm's own
 * offset: the sleeve head has to reach inboard far enough to meet the body of
 * the shirt, or a notch of bare shoulder shows between them.
 */
export function sleeveSections(long) {
  const end = sleeveEnd(long);
  return taper(long
    ? [{ y: Y.shoulder + 0.034, r: 0.065 }, { y: Y.elbow, r: 0.049 }, { y: end, r: 0.041 }]
    : [{ y: Y.shoulder + 0.034, r: 0.065 }, { y: end, r: 0.057 }], 0.03);
}

/** A trouser leg, in the wide cut or the straight one. Authored at `X.leg`. */
export function trouserSections(wide) {
  return taper([
    { y: Y.hips + 0.03, r: 0.098 },
    { y: Y.knee, r: wide ? 0.086 : 0.076 },
    { y: Y.ankle + 0.035, r: wide ? 0.085 : 0.063 }
  ], 0.02);
}

/* --------------------------------------------------------------- skinning -- */

/**
 * Which bones drive a vertex at height `y`, and how much, as `[bone, weight]`
 * pairs.
 *
 * Geometry between two bones is driven by the upper one; within `band` of a
 * joint the two blend, reaching an even split exactly at the joint. That is
 * what turns a hinge into a bend.
 */
export function chainWeights(y, chain, band) {
  const n = chain.length;
  const asc = chain[n - 1].y > chain[0].y;
  const v = asc ? y : -y;
  const ys = chain.map((c) => (asc ? c.y : -c.y));

  if (v <= ys[0]) return [[chain[0].bone, 1]];
  if (v >= ys[n - 1]) return [[chain[n - 1].bone, 1]];

  let i = 0;
  while (i < n - 2 && v > ys[i + 1]) i++;
  const dFar = ys[i + 1] - v;
  const dNear = v - ys[i];
  const wFar = dFar < band ? 0.5 * (1 - dFar / band) : 0;
  const wNear = (i > 0 && dNear < band) ? 0.5 * (1 - dNear / band) : 0;

  const acc = [[chain[i].bone, 1 - wFar - wNear]];
  if (wFar > 0) acc.push([chain[i + 1].bone, wFar]);
  if (wNear > 0) acc.push([chain[i - 1].bone, wNear]);
  return acc;
}

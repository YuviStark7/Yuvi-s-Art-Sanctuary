/**
 * The figure's dimensions, and the pure maths that turns them into the section
 * stacks its limbs and garments are lofted from.
 *
 * `js/character.js` builds the figure out of these numbers and
 * `tools/probe-figure.mjs` measures it against them. The probe used to keep its
 * own transcription of them and the two drifted within two merges: it went on
 * reporting the hands 266 mm outside the body long after they had been carried
 * out onto the wrists, because it was still describing a figure nobody ships.
 * A measuring tool that lies is worse than no tool, so the numbers live here
 * once and both files import them.
 *
 * Nothing in this file imports three.js, and that is the constraint that shapes
 * it. The probe runs under node with no import map, so a bare `three` specifier
 * anywhere in here would stop it loading at all. Geometry that needs three.js
 * stays in `character.js`; what lives here is numbers and arithmetic, and the
 * probe rebuilds the vertex positions it needs from the same stacks.
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

/**
 * How far either side of a joint the two bones blend to an even split.
 *
 * Only the limbs are here, because the limbs are what the probe skins: the
 * torso, collar and waistband bands are bound in `character.js` alone and
 * nothing outside it needs their numbers.
 */
export const BAND = { arm: 0.085, leg: 0.10 };

/* ------------------------------------------------------------ body shapes -- */

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

/** How much cloth stands off the body, shirt and trousers respectively. */
export const TOP_PAD = 0.021;
export const SEAT_PAD = 0.013;

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

/**
 * Where the arm tube and the hand stand, which is no longer the shoulder bone:
 * `ARM_CLEARANCE` moved the tube outboard, and anything authored on the bone
 * would step back in by that much.
 */
export const ARM_OFFSET = X.shoulder + ARM_CLEARANCE;

/* ---------------------------------------------------------- section stacks -- */

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

/*
 * The four limb and garment stacks, built rather than exported raw, so that a
 * bulge or a hem is a number in one place instead of an argument spelled out
 * at each call site.
 */

export function armSections() { return clearInboardFlank(taper(ARM_STOPS, 0.05)); }
export function legSections() { return taper(LEG_STOPS, 0.055); }

/** Where a sleeve stops, and so where its cuff sits. */
export function sleeveEnd(long) { return long ? Y.wrist + 0.028 : Y.shoulder - 0.150; }

export function sleeveSections(long) {
  const end = sleeveEnd(long);
  // the sleeve head has to reach inboard far enough to meet the body of the
  // shirt, or a notch of bare shoulder shows between them
  const stops = long
    ? [{ y: Y.shoulder + 0.034, r: 0.065 }, { y: Y.elbow, r: 0.049 }, { y: end, r: 0.041 }]
    : [{ y: Y.shoulder + 0.034, r: 0.065 }, { y: end, r: 0.057 }];
  return taper(stops, 0.03);
}

export function trouserSections(wide) {
  return taper([
    { y: Y.hips + 0.03, r: 0.098 },
    { y: Y.knee, r: wide ? 0.086 : 0.076 },
    { y: Y.ankle + 0.035, r: wide ? 0.085 : 0.063 }
  ], 0.02);
}

/** The shirt's body, from the hem to the collar. */
export function topBodySections() { return inflate(TORSO, TOP_PAD, 0.82, 1.46); }

/** The seat of the trousers, which the bare leg has to stay inside. */
export function seatSections() { return inflate(TORSO, SEAT_PAD, 0.82, 1.02); }

/* ------------------------------------------------------------------ hand -- */

/**
 * The hand, as rounded blocks on the centre line.
 *
 * Laid out symmetrically and carried out to the wrist by `ARM_OFFSET`, so the
 * two hands stay exact mirrors of one another. `x` and `tiltZ` are signed by
 * the side, which is what sets the thumb across the palm rather than out to
 * the same side on both hands.
 *
 * The probe measures these three blocks; the finger grooves in `character.js`
 * are a surface detail cut into the fingers and never the first thing to leave
 * the body, so it leaves them out rather than modelling a cylinder.
 */
export const HAND_SLABS = [
  { w: 0.070, h: 0.062, d: 0.031, r: 0.014, segs: 3, x: 0, y: Y.wrist - 0.034, z: 0 },
  { w: 0.066, h: 0.062, d: 0.027, r: 0.013, segs: 3, x: 0, y: Y.wrist - 0.092, z: 0.002 },
  { w: 0.024, h: 0.046, d: 0.024, r: 0.011, segs: 2, x: -0.030, y: Y.wrist - 0.052, z: 0.008,
    tiltZ: 0.55 }
];

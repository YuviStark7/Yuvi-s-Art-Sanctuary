/**
 * The figure's measurements, and the section-stack maths that shapes them.
 *
 * These numbers used to live in js/character.js and be restated by hand in
 * tools/probe-figure.mjs. The two copies drifted within three merges: after
 * the hands were carried out to the wrists and the arm's inboard flank was
 * moved out of the chest, the probe went on measuring an arm at the bone and
 * a hand on the centre line, and reported 266 mm of fault that no longer
 * existed. A measuring tool that lies is worse than no tool, so the numbers
 * live here and both files read them.
 *
 * Nothing in here imports three.js, so the offline tools in tools/ can load it
 * directly without the page's import map. Keep it that way — anything that
 * needs a BufferGeometry belongs in js/character.js.
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

export const ARM_STOPS = [
  { y: Y.shoulder + 0.03, r: 0.055 },
  { y: Y.elbow, r: 0.0425 },
  { y: Y.wrist, r: 0.0335 }
];

export const LEG_STOPS = [
  { y: Y.hips + 0.02, r: 0.0855 },
  { y: Y.knee, r: 0.0615 },
  { y: Y.ankle, r: 0.0425 }
];

/**
 * How each limb tube is swept and bound: the mid bulge that gives it muscle,
 * how many points go round it, and the width of the band over which two bones
 * share a vertex at a joint. The probe has to sweep and bind exactly as the
 * figure does or it is measuring a different body.
 */
export const LIMB = {
  arm: { bulge: 0.05, radial: 18, band: 0.085 },
  leg: { bulge: 0.055, radial: 20, band: 0.10 },
  sleeve: { bulge: 0.03, radial: 18, band: 0.085 },
  trouser: { bulge: 0.02, radial: 22, band: 0.10 }
};

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
 * Where the arm tube, and so the hand bound to its wrist, sits sideways.
 * `ARM_CLEARANCE` moved it outboard of the shoulder bone, and anything that
 * reads the bone's own offset instead lands a centimetre inside the figure.
 */
export const armOffset = (s) => s * (X.shoulder + ARM_CLEARANCE);

/**
 * Takes `ARM_CLEARANCE` off a section stack's `rx`, fading to nothing at the
 * elbow. Below there the arm is already clear of the chest, and the forearm is
 * seen from every angle, so it is left exactly as it was.
 */
export function clearInboardFlank(sections) {
  return sections.map((s) => {
    const k = Math.max(0, Math.min(1, (s.y - Y.elbow) / 0.06));
    return { y: s.y, rx: s.rx - ARM_CLEARANCE * k, rz: s.rz };
  });
}

/**
 * The hand, as the parts it is merged from: a palm, a soft block of fingers
 * with two grooves cut in, and a thumb set across.
 *
 * Each part is authored on the centre line and the whole hand is carried out
 * to `armOffset()` at the end, so the two hands stay exact mirrors of one
 * another. `at[0]` and `tiltZ` flip with the side; the rest does not. They are
 * listed in the order they are merged, so reading them here builds the same
 * mesh, vertex for vertex, that writing them out by hand did.
 */
export const HAND = {
  parts: [
    { slab: { w: 0.070, h: 0.062, d: 0.031, r: 0.014, segs: 3 },
      at: [0, Y.wrist - 0.034, 0] },
    { slab: { w: 0.066, h: 0.062, d: 0.027, r: 0.013, segs: 3 },
      at: [0, Y.wrist - 0.092, 0.002] },
    { grooves: { radius: 0.0032, length: 0.058, dx: 0.021 },
      at: [0, Y.wrist - 0.096, -0.014] },
    { slab: { w: 0.024, h: 0.046, d: 0.024, r: 0.011, segs: 2 },
      at: [-0.030, Y.wrist - 0.052, 0.008], tiltZ: 0.55 }
  ]
};

/* -------------------------------------------------------------- garments -- */

/** How much room each garment is cut with over the body it covers. */
export const GARMENT_PAD = { top: 0.021, bottom: 0.013 };

/** Grows a copy of a section stack outward, for a garment over a body part. */
export function inflate(sections, pad, from, to) {
  return sections
    .filter((s) => s.y >= (from === undefined ? -9 : from) && s.y <= (to === undefined ? 9 : to))
    .map((s) => ({ y: s.y, rx: s.rx + pad, rz: s.rz + pad }));
}

/** The shell of a top, from its hem to the collar. */
export const topShell = () => inflate(TORSO, GARMENT_PAD.top, 0.82, 1.46);

/** The seat of a pair of trousers, from the hem of the top to the waist. */
export const seatShell = () => inflate(TORSO, GARMENT_PAD.bottom, 0.82, 1.02);

/**
 * A sleeve's height stops. The sleeve head reaches inboard far enough to meet
 * the body of the shirt, or a notch of bare shoulder shows between them.
 */
export function sleeveStops(long) {
  return long
    ? [{ y: Y.shoulder + 0.034, r: 0.065 }, { y: Y.elbow, r: 0.049 },
       { y: Y.wrist + 0.028, r: 0.041 }]
    : [{ y: Y.shoulder + 0.034, r: 0.065 }, { y: Y.shoulder - 0.150, r: 0.057 }];
}

/** A trouser leg's height stops. The wide cut is the roomier of the two. */
export function trouserStops(wide) {
  return [
    { y: Y.hips + 0.03, r: 0.098 },
    { y: Y.knee, r: wide ? 0.086 : 0.076 },
    { y: Y.ankle + 0.035, r: wide ? 0.085 : 0.063 }
  ];
}

/* ------------------------------------------------------ section-stack maths */

/** Builds a limb's section stack between height stops, with a mid bulge. */
export function taper(stops, bulge) {
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

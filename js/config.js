/**
 * STARK MUSEO — dimensional blueprint of the sanctuary.
 * Every measurement is in metres. Change numbers here and the whole
 * building rebuilds around them.
 */

export const HALL = {
  radius: 15.0,        // interior floor radius
  wallHeight: 3.15,    // vertical wall before the dome springs
  domeRise: 4.55,      // extra height from springline to (virtual) apex
  shellThickness: 0.62 // concrete depth seen in every opening reveal
};

export const OCULUS = {
  radius: 3.65,        // the round opening the water falls from
  shaftHeight: 3.1     // how far the shaft climbs above the dome
};

// Organic skylights cut into the dome. Position is given in the shell's own
// surface coordinates: `along` = fraction of the meridian arc (0 = floor,
// 1 = oculus rim), `around` = compass angle in radians.
export const SKYLIGHTS = [
  { along: 0.66, around: -2.30, a: 3.15, b: 1.32, tilt:  0.55 },
  { along: 0.80, around: -1.72, a: 2.25, b: 1.02, tilt: -0.30 },
  { along: 0.62, around: -1.12, a: 1.60, b: 0.80, tilt:  0.95 },
  { along: 0.83, around:  1.95, a: 2.70, b: 1.15, tilt: -0.70 },
  { along: 0.68, around:  2.55, a: 1.45, b: 0.74, tilt:  0.35 }
];

// Arched doorways cut through the wall into the side chambers.
export const ALCOVES = [
  { around: Math.PI * 0.78, width: 2.15, height: 3.00, depth: 5.4 },
  { around: Math.PI * 0.98, width: 1.75, height: 2.72, depth: 4.6 }
];

export const POOL = {
  radius: 6.05,
  waterLevel: -0.16,   // surface sits just below the floor plane
  depth: 0.62,
  lipWidth: 0.34
};

export const ISLAND = {
  radius: 2.30,
  height: 0.58
};

export const CURTAIN = {
  radius: 3.42,        // water falls inside the pool, outside the island
  top: 7.36,           // hangs from the oculus rim
  layers: 5
};

export const TREE = {
  height: 5.35,
  trunkRadius: 0.215,

  /* Which tree stands on the island.
   *   'blossom' — the imported model in models/blossom-tree.glb
   *   'grown'   — the one nature.js grows from code
   * If the model fails to load for any reason the grown tree takes over, so
   * the sanctuary never comes up empty. */
  model: 'blossom',
  modelUrl: './models/blossom-tree.glb'
};

// Concentric seating: partial arcs, deliberately broken so you can walk through.
export const BENCHES = [
  { radius: 7.55, height: 0.40, depth: 0.58, arcs: [[-0.62, 0.62], [2.24, 3.42], [4.05, 4.92]] },
  { radius: 9.30, height: 0.40, depth: 0.58, arcs: [[-1.35, -0.32], [0.34, 1.30], [3.05, 4.10]] }
];

export const PLAYER = {
  eyeHeight: 1.62,
  radius: 0.34,
  walkSpeed: 1.45,
  fastSpeed: 2.95,
  accel: 9.0,
  damping: 11.0,
  bobAmount: 0.026,
  bobSpeed: 8.4
};

// Where the camera rides in third person.
export const CAMERA = {
  distance: 3.35,       // resting length of the spring arm
  minDistance: 1.30,
  maxDistance: 6.20,
  pivotHeight: 1.46,    // roughly the figure's shoulder
  shoulder: 0.42,       // offset to the right, so the figure is not centred
  pitch: 0.06,
  minPitch: -0.62,
  maxPitch: 1.15,
  turnRate: 9.0         // how quickly the figure swings to face its heading
};

// The coin toss at the pool's edge.
export const WISHING = {
  reach: 3.4,           // how near the water the prompt appears
  coinRadius: 0.021,
  arcHeight: 1.9,
  flightTime: 1.15
};

export const RENDER = {
  fov: 62,
  near: 0.06,
  far: 220
};

// Light of a still afternoon: cool sky bounce, warm sun through the openings.
export const PALETTE = {
  concrete:    0xaca7a0,
  concreteDeep:0x8d8880,
  floor:       0xa9a59d,
  sky:         0xdfe9ef,
  sun:         0xfff2dc,
  // "ground" for the hemisphere light is the light bouncing back off the
  // floor — and this floor is pale concrete, not earth. Darken it and the
  // whole dome goes brown, because the dome only ever faces downward.
  ground:      0xc9c5bd,
  water:       0x8d9490,
  foliage:     0x7d8a6a,
  bark:        0x6a6157,
  rock:        0x979186
};

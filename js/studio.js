/**
 * The warm room behind the wide arch: the one place in the building that is not daylight.
 *
 * The desk itself is desk.js. `chamber` comes from buildSanctuary. Positions here are given as (side, height, forward):
 * metres to the right of the room's axis, above the floor, and beyond the hall's wall.
 */
import * as THREE from 'three';
import { buildDesk, TOP } from './desk.js';
import { buildCyborg } from './cyborg.js';
import { buildSteelSky } from './cyborg.body.js';
import { buildInvitations } from './invitations.js';

const GLOW = new THREE.Color(1.0, 0.62, 0.30);

export function buildStudio(chamber, textures, quality) {
  const group = new THREE.Group();
  group.name = 'studio';
  const { spec, at, back, front, lip } = chamber;

  /* ---- warm light strips: round the arch, and along the foot of the walls ---- */
  const strip = new THREE.MeshBasicMaterial({ color: GLOW.clone().multiplyScalar(2.4), toneMapped: false });

  // follow the arch a little way into the thickness of the wall, tucked just inside its edge.
  // (Taken from the near edge: the far edge of the reveal sits higher and the lip would hide it.)
  const rim = lip.map((p, k) => {
    const q = p.clone().lerp(front[k], 0.3);
    return q.lerp(at(0, Math.min(q.y, 1.4), chamber.spec.desk * 0.2), 0.006);
  });
  const path = new THREE.CatmullRomCurve3(rim, false, 'catmullrom', 0.1);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(path, 160, 0.018, 6, false), strip));

  const line = (a, b) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, a.distanceTo(b)), strip);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.lookAt(b);
    group.add(mesh);
  };
  const foot = (p, f) => at(p.clone().sub(chamber.base).dot(chamber.right) * 0.992, 0.03, f);
  const left = front[0], right = front[front.length - 1];
  line(foot(left, 0.75), foot(left, back - 0.05));
  line(foot(right, 0.75), foot(right, back - 0.05));
  line(foot(left, back - 0.05), foot(right, back - 0.05));

  /* ---- the desk, the decks and the holograms ---- */
  const desk = buildDesk(chamber, textures);
  group.add(desk.group);

  // the polished floor's reflection: the desk again, upside down under a slightly clear floor.
  // Far cheaper than a mirror pass, which would draw the whole building a third time.
  const mirrored = desk.group.clone();
  mirrored.name = 'desk-reflection';
  mirrored.scale.y = -1;
  mirrored.traverse((o) => { o.castShadow = o.receiveShadow = false; });
  group.add(mirrored);
  chamber.floorMaterial.transparent = true;
  chamber.floorMaterial.opacity = 0.92;

  /* ---- the invitations, which come up over two of the holograms ---- */
  const invitations = buildInvitations(chamber, desk.replaced);
  group.add(invitations.group);

  /* ---- light: as many lamps as the two old side rooms had, so the hall costs the same ---- */
  const lights = [];
  const lamp = (side, y, f, aimSide, aimY, aimF, power, angle) => {
    const l = new THREE.SpotLight(0xffc98f, power, 11, angle, 0.75, 1.3);
    l.position.copy(at(side, y, f));
    l.target.position.copy(at(aimSide, aimY, aimF));
    group.add(l, l.target);
    lights.push(l);
    return l;
  };
  const key = lamp(0, spec.height - 0.15, spec.desk - 1.7, 0, 0.4, spec.desk, 34, 1.05);
  key.castShadow = quality.chamberShadows;
  if (key.castShadow) {
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0012;
  }
  lamp(0, 0.35, back - 0.35, 0, 3.0, back - 0.1, 16, 1.2);      // washes up the back wall

  /**
   * One look around from where she will stand, so the metal and the polished floor mirror this
   * warm room and not the bright hall the rest of the building reflects. Done once, at load.
   */
  let probe = null, steel = null;
  const capture = (renderer, scene) => {
    const target = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    const camera = new THREE.CubeCamera(0.05, 60, target);
    camera.position.copy(at(0, 1.5, spec.desk - 0.9));
    scene.add(camera);
    const cards = new THREE.Group();
    const card = (side, y, f, w, h, power) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.0, 0.86, 0.70).multiplyScalar(power), side: THREE.DoubleSide
      }));
      mesh.position.copy(at(side, y, f));
      mesh.lookAt(camera.position);
      cards.add(mesh);
    };
    card(0, 3.5, spec.desk - 1.2, 4.5, 0.5, 1.25);       // a strip overhead
    card(-3.2, 1.7, spec.desk - 2.2, 0.5, 2.2, 1.05);    // one upright to each side, out front
    card(3.2, 1.7, spec.desk - 2.2, 0.5, 2.2, 0.75);
    card(0, 0.25, spec.desk - 2.8, 6.0, 0.35, 0.9);     // the bright hall's floor, low down
    scene.add(cards);

    desk.group.visible = mirrored.visible = false;
    renderer.shadowMap.needsUpdate = true;
    camera.update(renderer, scene);
    desk.group.visible = mirrored.visible = true;
    scene.remove(camera, cards);
    cards.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });

    const pmrem = new THREE.PMREMGenerator(renderer);
    probe = pmrem.fromCubemap(target.texture);
    pmrem.dispose();
    target.dispose();
    for (const material of [...desk.reflective, chamber.floorMaterial]) {
      material.envMap = probe.texture;
      material.needsUpdate = true;
    }
    desk.reflective.forEach((m) => { m.envMapIntensity = 2.2; });
    steel = buildSteelSky(renderer, chamber.forward, chamber.right);
    renderer.shadowMap.needsUpdate = true;
  };

  /* ---- her: loaded after the room is open, so the loading screen is no longer for her ---- */
  const studio = {
    group, lights, animated: desk.animated, capture, dj: null, gone: false,
    heartAt: at(0, 1.35, spec.desk + 0.5),
    chamber,
    async arrive() {
      const dj = await buildCyborg(chamber, probe.texture, steel.texture, TOP);
      if (studio.gone) { dj.dispose(); return; }          // the room was rebuilt while she loaded
      studio.dj = dj;
      group.add(dj.group);
    },
    update(t, visitor) {
      if (studio.dj) studio.dj.update(t, visitor);
      const far = visitor ? Math.hypot(visitor.x - studio.heartAt.x, visitor.z - studio.heartAt.z) : Infinity;
      invitations.update(t, Math.max(0, Math.min(1, (5.4 - far) / 1.2)));
    },
    dispose() {
      studio.gone = true;
      invitations.dispose();
      if (studio.dj) { studio.dj.group.removeFromParent(); studio.dj.dispose(); }
      if (probe) probe.dispose();
      if (steel) steel.dispose();
    }
  };
  return studio;
}

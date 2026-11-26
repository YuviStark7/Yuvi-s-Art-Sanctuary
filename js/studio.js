/**
 * The warm room behind the wide arch: the one place in the building that is not daylight.
 *
 * `chamber` comes from buildSanctuary. Positions here are given as (side, height, forward):
 * metres to the right of the room's axis, above the floor, and beyond the hall's wall.
 */
import * as THREE from 'three';

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

  /* ---- the desk: a stand-in for scale, until the real one is built ---- */
  const stone = new THREE.MeshStandardMaterial({
    color: 0xa8896a, map: textures.rock.map, normalMap: textures.rock.normalMap, roughness: 0.85
  });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb9ada0, roughness: 0.34, metalness: 0.9 });

  for (const [side, w, h] of [[-0.95, 1.5, 0.82], [1.15, 1.1, 0.82]]) {
    const geo = new THREE.DodecahedronGeometry(0.5, 0);
    geo.scale(w, h * 1.1, 0.8);
    const rock = new THREE.Mesh(geo, stone);
    rock.position.copy(at(side, h * 0.4, spec.desk));
    rock.rotation.y = -spec.around + side * 0.5;
    rock.castShadow = rock.receiveShadow = true;
    group.add(rock);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.24, 4.4), metal);
  top.position.copy(at(0, 0.98, spec.desk));
  top.rotation.y = -spec.around;
  top.castShadow = top.receiveShadow = true;
  group.add(top);

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

  return { group, lights };
}

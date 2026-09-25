/**
 * Loading imported .glb models.
 *
 * Everything else in the sanctuary is drawn from code at start-up, so this is
 * the one place that fetches a file over the network. Two things matter here:
 *
 *  - Models are cached by URL. Changing the quality setting tears the world
 *    down and rebuilds it, and we must not re-download a few megabytes each
 *    time.
 *  - Because a cached model is reused across those rebuilds, its geometry and
 *    materials must survive disposeWorld(). markShared() tags them so the
 *    teardown steps over them; without it the second build would draw nothing.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const cache = new Map();
let loader = null;

function getLoader() {
  if (!loader) loader = new GLTFLoader();
  return loader;
}

/**
 * Fetch and parse a .glb. Resolves to the gltf object, or rejects.
 * onProgress receives 0..1, but only when the server sends a content length.
 */
export function loadModel(url, onProgress) {
  if (cache.has(url)) return cache.get(url);

  const promise = new Promise((resolve, reject) => {
    getLoader().load(
      url,
      (gltf) => {
        markShared(gltf.scene);
        resolve(gltf);
      },
      (evt) => {
        if (onProgress && evt.lengthComputable && evt.total > 0) {
          onProgress(Math.min(1, evt.loaded / evt.total));
        }
      },
      (err) => {
        cache.delete(url);           // let a later attempt retry
        reject(err);
      }
    );
  });

  cache.set(url, promise);
  return promise;
}

/**
 * Tag an object tree as owned by the model cache rather than by the world, so
 * that disposeWorld() leaves its geometry, materials and textures alone.
 */
export function markShared(object) {
  object.traverse((o) => {
    o.userData.shared = true;
    if (o.geometry) o.geometry.userData.shared = true;
    if (o.material) {
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        m.userData.shared = true;
      }
    }
  });
  return object;
}

/** Collect every texture used by a cached model, for the disposal keep-set. */
export function modelTextures(object, into) {
  const keep = into || new Set();
  object.traverse((o) => {
    if (!o.material) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      for (const v of Object.values(m)) {
        if (v && v.isTexture) keep.add(v);
      }
    }
  });
  return keep;
}

/** Bounding box helper used when fitting an imported model to the room. */
export function measure(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  return { box, size, centre };
}

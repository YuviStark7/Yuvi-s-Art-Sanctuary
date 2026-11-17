/**
 * MakeHuman "proxy" files (.mhclo): clothes, hair, eyes, brows and lashes.
 *
 * A proxy is not stored at a fixed size. Each of its vertices is described
 * relative to the base mesh — three body vertices, three weights, and an offset —
 * and the three `*_scale` lines say how to stretch those offsets as the body's
 * proportions change. Fit it to any morphed body and it follows. The same
 * description is what lets a garment inherit its skin weights from the body.
 */
import fs from 'fs';
import path from 'path';
import { parseObj } from './mh.mjs';

export function parseMhclo(file) {
  const out = {
    file, dir: path.dirname(file), name: '', obj: '', material: '',
    scale: {}, refs: [], deleteVerts: new Set(), zDepth: 0, license: '', author: ''
  };
  let mode = '';
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    if (l[0] === '#') {
      const m = /^#\s*(license|author)\s+(.*)$/i.exec(l);
      if (m) out[m[1].toLowerCase()] = m[2];
      continue;
    }
    const w = l.split(/\s+/);
    const first = w[0];
    if (!/^[-+.\d]/.test(first)) {                 // a keyword line
      // Only a block keyword changes what the number lines mean. Some files put
      // `material` (or `name`) between `verts 0` and the vertices themselves.
      switch (first) {
        case 'name': out.name = w.slice(1).join(' '); break;
        case 'obj_file': out.obj = w[1]; break;
        case 'material': out.material = w[1]; break;
        case 'x_scale': out.scale.x = [+w[1], +w[2], +w[3]]; break;
        case 'y_scale': out.scale.y = [+w[1], +w[2], +w[3]]; break;
        case 'z_scale': out.scale.z = [+w[1], +w[2], +w[3]]; break;
        case 'z_depth': out.zDepth = +w[1]; break;
        case 'verts': mode = 'verts'; break;
        case 'delete_verts': mode = 'delete'; break;
        case 'weights': case 'subsurf': case 'subdivide': mode = 'skip'; break;
        default: break;
      }
      continue;
    }
    if (mode === 'verts') {
      if (w.length === 1) out.refs.push({ v: [+w[0], +w[0], +w[0]], w: [1, 0, 0], d: [0, 0, 0] });
      else out.refs.push({
        v: [+w[0], +w[1], +w[2]], w: [+w[3], +w[4], +w[5]],
        d: w.length >= 9 ? [+w[6], +w[7], +w[8]] : [0, 0, 0]
      });
    } else if (mode === 'delete') {
      // "a - b" ranges and single indices share a line
      for (let i = 0; i < w.length; i++) {
        if (w[i + 1] === '-') {
          const a = +w[i], b = +w[i + 2];
          for (let v = a; v <= b; v++) out.deleteVerts.add(v);
          i += 2;
        } else out.deleteVerts.add(+w[i]);
      }
    }
  }
  return out;
}

/** The OBJ a proxy points at, parsed. */
export function loadProxyMesh(mh) {
  return parseObj(path.join(mh.dir, mh.obj));
}

/**
 * Place the proxy's vertices on a (morphed) body. `pos` is the full base-mesh
 * position array, so helper-tights, eyes and the rest of the fitting geometry
 * are available as anchors.
 */
export function fitProxy(mh, pos) {
  const s = [1, 1, 1];
  ['x', 'y', 'z'].forEach((axis, a) => {
    const sc = mh.scale[axis];
    if (!sc) return;
    s[a] = Math.abs(pos[sc[0] * 3 + a] - pos[sc[1] * 3 + a]) / sc[2];
  });
  const n = mh.refs.length;
  const out = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = mh.refs[i];
    for (let a = 0; a < 3; a++) {
      out[i * 3 + a] =
        r.w[0] * pos[r.v[0] * 3 + a] + r.w[1] * pos[r.v[1] * 3 + a] + r.w[2] * pos[r.v[2] * 3 + a] +
        r.d[a] * s[a];
    }
  }
  return out;
}

/** The .mhmat key/value lines: textures, colours, flags. */
export function parseMhmat(file) {
  const m = {};
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith('#') || l.startsWith('//')) continue;
    const w = l.split(/\s+/);
    if (w[0] === 'shaderConfig' || w[0] === 'shaderParam') { m[w[0] + ':' + w[1]] = w.slice(2).join(' '); continue; }
    m[w[0]] = w.slice(1).join(' ');
  }
  return m;
}

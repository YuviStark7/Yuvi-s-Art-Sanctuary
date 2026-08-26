/**
 * Water: the circular pool, the curtain falling from the oculus, and the mist
 * where the two meet.
 *
 * The pool surface does not use a reflection pass. It reflects an analytic
 * room instead — a bright dome with the oculus punched into it — which is
 * cheap, stable, and makes the opening dance across the ripples exactly the
 * way it does in the reference image.
 */
import * as THREE from 'three';
import { POOL, CURTAIN, OCULUS, HALL, PALETTE } from './config.js';
import { makeTriplanar } from './architecture.js';

const GLSL_NOISE = /* glsl */`
  float hash11( float p ) {
    p = fract( p * 0.1031 );
    p *= p + 33.33;
    p *= p + p;
    return fract( p );
  }
  float hash21( vec2 p ) {
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
  }
  float vnoise( vec2 p ) {
    vec2 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash21( i );
    float b = hash21( i + vec2( 1.0, 0.0 ) );
    float c = hash21( i + vec2( 0.0, 1.0 ) );
    float d = hash21( i + vec2( 1.0, 1.0 ) );
    return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
  }
  float fbm2( vec2 p ) {
    float s = 0.0, a = 0.5;
    for ( int i = 0; i < 4; i++ ) { s += a * vnoise( p ); p *= 2.02; a *= 0.5; }
    return s;
  }
`;

/* ---------------------------------------------------------- pool basin -- */

export function buildPool(textures) {
  const group = new THREE.Group();
  group.name = 'pool';

  const basinMat = makeTriplanar(new THREE.MeshStandardMaterial({
    color: 0x8b8880,
    map: textures.concrete.map,
    roughnessMap: textures.concrete.roughnessMap,
    roughness: 0.72,
    metalness: 0.0,
    side: THREE.DoubleSide
  }), 2.6);

  // rim, inner wall and floor of the basin in one revolved profile
  const d = POOL.depth;
  const pts = [
    new THREE.Vector2(0.0, -d),
    new THREE.Vector2(POOL.radius - 0.18, -d),
    new THREE.Vector2(POOL.radius - 0.03, -d + 0.14),
    new THREE.Vector2(POOL.radius, -0.05),
    new THREE.Vector2(POOL.radius + 0.05, 0.0),
    new THREE.Vector2(POOL.radius + POOL.lipWidth, 0.0)
  ];
  const basin = new THREE.Mesh(new THREE.LatheGeometry(pts, 144), basinMat);
  basin.receiveShadow = true;
  group.add(basin);

  return { group, basinMat };
}

/* -------------------------------------------------------- water surface -- */

export function buildWaterSurface(textures, oculusRimY) {
  const uniforms = {
    uTime: { value: 0 },
    uRipple: { value: textures.waterNormal },
    uDeep: { value: new THREE.Color(0x5b615e) },
    uTint: { value: new THREE.Color(PALETTE.water) },
    uWall: { value: new THREE.Color(0x9ba09e) },
    uSky: { value: new THREE.Color(0xdde4e6) },
    uOculusY: { value: oculusRimY + OCULUS.shaftHeight },
    uOculusR: { value: OCULUS.radius },
    uCurtainR: { value: CURTAIN.radius },
    uLevel: { value: POOL.waterLevel },
    uAgitation: { value: 1.0 },
    // where the last coin went in, and how long ago (negative = none)
    uSplashPos: { value: new THREE.Vector2(0, 0) },
    uSplashAge: { value: -1.0 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      varying vec2 vXZ;
      void main() {
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vWorld = w.xyz;
        vXZ = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform sampler2D uRipple;
      uniform vec3 uDeep, uTint, uWall, uSky;
      uniform float uOculusY, uOculusR, uCurtainR, uLevel, uAgitation;
      uniform vec2 uSplashPos;
      uniform float uSplashAge;
      varying vec3 vWorld;
      varying vec2 vXZ;

      ${GLSL_NOISE}

      vec3 sampleRipple( vec2 uv ) {
        return texture2D( uRipple, uv ).xyz * 2.0 - 1.0;
      }

      void main() {
        float rad = length( vXZ );
        float t = uTime;

        /* two drifting ripple fields at different scales */
        vec3 n1 = sampleRipple( vXZ * 0.085 + vec2(  0.013, -0.019 ) * t );
        vec3 n2 = sampleRipple( vXZ * 0.031 + vec2( -0.008,  0.011 ) * t );
        vec3 nrm = normalize( vec3( n1.x * 0.55 + n2.x * 0.75, 3.4, n1.z * 0.55 + n2.z * 0.75 ) );

        /* rings travelling out from where the curtain lands */
        float d = rad - uCurtainR;
        float decay = exp( -abs( d ) * 0.40 );
        float phase = d * 5.2 - t * 2.35;
        float ring = sin( phase ) * decay * uAgitation;
        vec2 dir = rad > 0.001 ? vXZ / rad : vec2( 1.0, 0.0 );
        nrm = normalize( nrm + vec3( dir.x, 0.0, dir.y ) * ring * 0.30 );

        /* churn right under the falling water */
        float turb = exp( -abs( d ) * 1.15 ) * uAgitation;
        float chop = fbm2( vXZ * 3.1 + vec2( 0.0, t * 1.7 ) );
        nrm = normalize( nrm + vec3( ( chop - 0.5 ), 0.0, ( fbm2( vXZ * 3.3 - t * 1.4 ) - 0.5 ) ) * turb * 1.1 );

        /* a coin going in: one ring racing outward, dying as it goes */
        float splashFoam = 0.0;
        if ( uSplashAge >= 0.0 ) {
          vec2 sv = vXZ - uSplashPos;
          float sd = length( sv );
          float front = uSplashAge * 2.6;                    // radius of the ring
          float band = sd - front;
          float ring = sin( band * 22.0 ) * exp( -abs( band ) * 3.4 );
          float life = exp( -uSplashAge * 1.35 ) * smoothstep( 0.0, 0.05, uSplashAge );
          float near = exp( -sd * 0.75 );
          vec2 sdir = sd > 0.001 ? sv / sd : vec2( 1.0, 0.0 );
          nrm = normalize( nrm + vec3( sdir.x, 0.0, sdir.y ) * ring * life * near * 0.85 );
          splashFoam = smoothstep( 0.55, 1.0, abs( ring ) ) * life * near;
          // the crown of spray right where it broke the surface
          splashFoam += exp( -sd * 9.0 ) * exp( -uSplashAge * 5.0 ) * 0.9;
        }

        vec3 V = normalize( cameraPosition - vWorld );
        float fres = pow( 1.0 - clamp( dot( nrm, V ), 0.0, 1.0 ), 3.6 );
        fres = clamp( 0.035 + fres * 0.95, 0.0, 1.0 );

        vec3 Rv = reflect( -V, nrm );

        /* the analytic room: pale dome, bright hole where the oculus is */
        float up = clamp( Rv.y, 0.0, 1.0 );
        vec3 env = mix( uWall, uSky, smoothstep( 0.05, 0.75, up ) );
        if ( Rv.y > 0.02 ) {
          float k = ( uOculusY - vWorld.y ) / Rv.y;
          vec2 hit = vWorld.xz + Rv.xz * k;
          float hr = length( hit ) / uOculusR;
          float disc = 1.0 - smoothstep( 0.72, 1.04, hr );
          env += vec3( 1.0 ) * disc * 1.85;
        }

        /* what little you see of the basin */
        vec3 body = mix( uDeep, uTint, 0.45 );
        float depthFade = smoothstep( 0.0, 1.6, abs( d ) );
        body = mix( body * 1.12, body, depthFade );

        vec3 col = mix( body, env, fres );

        /* foam and spray around the impact ring */
        float foamN = fbm2( vXZ * 5.5 + vec2( t * 0.9, -t * 1.3 ) );
        float foam = smoothstep( 0.56, 0.95, foamN ) * turb;
        foam += smoothstep( 0.62, 1.0, abs( ring ) ) * decay * 0.22;
        foam += splashFoam;
        col = mix( col, vec3( 0.92, 0.94, 0.95 ), clamp( foam * 0.85, 0.0, 0.82 ) );

        /* a last glint on the very tips of the ripples */
        col += vec3( 1.0 ) * pow( max( 0.0, nrm.y - 0.988 ), 0.6 ) * 0.32;

        float alpha = clamp( 0.86 + fres * 0.14 + foam * 0.3, 0.0, 1.0 );
        gl_FragColor = vec4( col, alpha );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });

  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(POOL.radius - 0.015, 192),
    material
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = POOL.waterLevel;
  mesh.name = 'waterSurface';
  mesh.renderOrder = 2;

  return { mesh, uniforms };
}

/* --------------------------------------------------------- water curtain -- */

/**
 * Several nested cylinders. The inner ones read as the dense sheet near the
 * oculus, the outer ones as individual strands breaking away as they fall.
 */
export function buildCurtain(bottomY, topY) {
  const group = new THREE.Group();
  group.name = 'curtain';
  const height = topY - bottomY;
  const shared = [];

  const layers = [
    { r: 1.000, strands: 150, opacity: 0.155, speed: 1.00, blend: THREE.NormalBlending,   seed: 1.0 },
    { r: 0.986, strands: 205, opacity: 0.125, speed: 1.18, blend: THREE.NormalBlending,   seed: 7.3 },
    { r: 1.016, strands: 260, opacity: 0.100, speed: 0.88, blend: THREE.NormalBlending,   seed: 3.9 },
    { r: 1.004, strands: 330, opacity: 0.085, speed: 1.34, blend: THREE.AdditiveBlending, seed: 11.2 },
    { r: 0.972, strands: 120, opacity: 0.060, speed: 0.74, blend: THREE.AdditiveBlending, seed: 17.6 }
  ];

  for (let i = 0; i < Math.min(CURTAIN.layers, layers.length); i++) {
    const L = layers[i];
    const uniforms = {
      uTime: { value: 0 },
      uStrands: { value: L.strands },
      uSpeed: { value: L.speed },
      uOpacity: { value: L.opacity },
      uSeed: { value: L.seed },
      uHeight: { value: height },
      uColor: { value: new THREE.Color(0xf2f7fa) }
    };
    shared.push(uniforms);

    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: L.blend,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4( position, 1.0 );
          vWorld = w.xyz;
          vNormalW = normalize( mat3( modelMatrix ) * normal );
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uStrands, uSpeed, uOpacity, uSeed, uHeight;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying vec3 vWorld;
        varying vec3 vNormalW;

        ${GLSL_NOISE}

        void main() {
          /* split the circumference into individual falling strands */
          float col = vUv.x * uStrands;
          float id  = floor( col );
          float f   = fract( col );

          float h  = hash11( id + uSeed * 13.0 );
          float h2 = hash11( id * 1.7 + uSeed * 4.0 );

          float width = mix( 0.30, 0.95, h2 );
          float strand = smoothstep( width, width * 0.18, abs( f - 0.5 ) * 2.0 );

          /* fall, each strand at its own rate */
          float fallY = ( 1.0 - vUv.y ) * uHeight;
          float ph = fallY * mix( 1.4, 2.6, h ) - uTime * uSpeed * mix( 7.0, 12.0, h2 );

          /* droplet trains: the sheet breaks up the further it falls */
          float beads = vnoise( vec2( id * 3.7 + uSeed, ph * 0.55 ) );
          float streak = mix( 0.35, 1.0, beads );

          /* denser, but never solid, where it leaves the rim */
          float sheet = smoothstep( 0.34, 1.0, vUv.y );
          float body = mix( strand * streak, 0.34 + strand * 0.42, sheet );

          /* thin out at the very bottom as it enters the pool */
          body *= smoothstep( 0.0, 0.10, vUv.y ) * 0.85 + 0.15;

          /* backlit rim: brightest where you look through the sheet edge-on */
          vec3 V = normalize( cameraPosition - vWorld );
          float graze = 1.0 - abs( dot( normalize( vNormalW ), V ) );
          float rim = pow( clamp( graze, 0.0, 1.0 ), 2.2 );

          float a = body * uOpacity * ( 0.62 + rim * 0.62 );
          if ( a < 0.004 ) discard;

          vec3 c = uColor * ( 0.72 + rim * 0.42 + sheet * 0.18 );
          gl_FragColor = vec4( c, clamp( a, 0.0, 1.0 ) );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });

    const geo = new THREE.CylinderGeometry(
      CURTAIN.radius * L.r, CURTAIN.radius * L.r * 1.012, height, 128, 1, true
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = bottomY + height / 2;
    mesh.renderOrder = 10 + i;
    group.add(mesh);
  }

  return { group, uniformSets: shared };
}

/* ---------------------------------------------------------------- mist -- */

/** Spray lifting off the impact ring, plus a low haze inside the curtain. */
export function buildMist(textures, baseY, count) {
  const n = count || 900;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  const scale = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const spread = CURTAIN.radius + (Math.random() - 0.5) * 1.9;
    pos[i * 3] = Math.cos(a) * spread;
    pos[i * 3 + 1] = baseY + Math.random() * 2.1;
    pos[i * 3 + 2] = Math.sin(a) * spread;
    seed[i] = Math.random();
    scale[i] = 0.30 + Math.random() * 1.05;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));

  const uniforms = {
    uTime: { value: 0 },
    uSprite: { value: textures.dot },
    uBase: { value: baseY },
    uSize: { value: 30.0 },
    uOpacity: { value: 0.115 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uBase, uSize;
      attribute float aSeed;
      attribute float aScale;
      varying float vFade;
      varying float vSeed;
      void main() {
        vSeed = aSeed;
        vec3 p = position;
        float life = fract( aSeed + uTime * ( 0.055 + aSeed * 0.075 ) );
        p.y = uBase + life * 2.4;
        float swirl = uTime * ( 0.16 + aSeed * 0.22 ) + aSeed * 6.28;
        p.x += sin( swirl ) * ( 0.24 + life * 0.85 );
        p.z += cos( swirl * 0.83 ) * ( 0.24 + life * 0.85 );
        vFade = sin( life * 3.14159 );
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        gl_PointSize = uSize * aScale * ( 1.0 + life * 1.7 ) / max( 0.4, -mv.z );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uSprite;
      uniform float uOpacity;
      varying float vFade;
      varying float vSeed;
      void main() {
        float a = texture2D( uSprite, gl_PointCoord ).a;
        a *= vFade * uOpacity * ( 0.5 + vSeed * 0.7 );
        if ( a < 0.004 ) discard;
        gl_FragColor = vec4( vec3( 0.93, 0.95, 0.97 ), a );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = 20;
  points.name = 'mist';
  return { points, uniforms };
}

/* ------------------------------------------------------- volumetric light -- */

/**
 * Fake light shafts. Each is a cone of translucent haze hanging under an
 * opening, brightest when you look toward its source.
 */
export function buildLightShaft(from, direction, length, topRadius, bottomRadius, intensity) {
  const uniforms = {
    uTime: { value: 0 },
    uIntensity: { value: intensity },
    uColor: { value: new THREE.Color(0xf7f5ee) }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vWorld = w.xyz;
        vNormalW = normalize( mat3( modelMatrix ) * normal );
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uIntensity;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormalW;

      ${GLSL_NOISE}

      void main() {
        /* brightest at the opening, dissolving before it reaches the floor */
        float along = smoothstep( 0.03, 0.46, vUv.y ) * mix( 0.30, 1.0, vUv.y );
        vec3 V = normalize( cameraPosition - vWorld );
        float graze = 1.0 - abs( dot( normalize( vNormalW ), V ) );
        float edge = pow( clamp( graze, 0.0, 1.0 ), 1.6 );

        /* dust drifting through the beam */
        float dust = fbm2( vec2( vUv.x * 7.0, vUv.y * 3.0 - uTime * 0.05 ) );
        float a = along * edge * uIntensity * ( 0.55 + dust * 0.75 );
        if ( a < 0.002 ) discard;
        gl_FragColor = vec4( uColor * a, a );
      }`
  });

  const geo = new THREE.CylinderGeometry(topRadius, bottomRadius, length, 40, 12, true);
  geo.translate(0, -length / 2, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(from);

  const q = new THREE.Quaternion();
  q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction.clone().normalize());
  mesh.quaternion.copy(q);
  mesh.renderOrder = 8;
  mesh.frustumCulled = false;

  return { mesh, uniforms };
}

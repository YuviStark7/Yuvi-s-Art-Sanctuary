/**
 * The two invitations that come up on the screens behind her as a visitor reaches the desk: a
 * letter to the artist, and the mail club (not open yet, so it only says so).
 *
 * Each is drawn once onto a canvas and then simply faded in and out; nothing is redrawn or
 * uploaded while the visitor walks.
 */
import * as THREE from 'three';

const W = 1024, H = 660;
const SERIF = "'Cormorant Garamond', 'Iowan Old Style', Georgia, serif";
const SANS = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
const INK = '#f4e7d6', SOFT = 'rgba(244, 231, 214, 0.66)', WARM = '#ffc487';

function spaced(ctx, text, y, gap) {
  const widths = [...text].map((c) => ctx.measureText(c).width);
  let x = (W - widths.reduce((a, b) => a + b + gap, -gap)) / 2;
  ctx.textAlign = 'left';
  [...text].forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + gap; });
  ctx.textAlign = 'center';
}

function draw(card) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const box = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  box(8, 8, W - 16, H - 16, 30);
  ctx.fillStyle = 'rgba(30, 20, 13, 0.95)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255, 205, 150, 0.85)';
  ctx.stroke();
  box(30, 30, W - 60, H - 60, 18);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 205, 150, 0.30)';
  ctx.stroke();

  ctx.fillStyle = WARM;
  ctx.font = `500 30px ${SANS}`;
  spaced(ctx, card.kicker, 112, 9);

  ctx.fillStyle = INK;
  ctx.font = `300 94px ${SERIF}`;
  card.title.forEach((line, i) => ctx.fillText(line, W / 2, 252 + i * 100));

  ctx.fillStyle = SOFT;
  ctx.font = `400 33px ${SANS}`;
  ctx.fillText(card.line, W / 2, 456);

  box(W / 2 - 250, 515, 500, 76, 38);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = card.open ? WARM : 'rgba(244, 231, 214, 0.32)';
  ctx.stroke();
  ctx.fillStyle = card.open ? WARM : SOFT;
  ctx.font = `500 27px ${SANS}`;
  spaced(ctx, card.action, 554, 6);

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * @param chamber   from buildSanctuary
 * @param replaced  uniforms of the holograms that go dark while these show
 */
export function buildInvitations(chamber, replaced = []) {
  const group = new THREE.Group();
  group.name = 'invitations';
  const { at, spec } = chamber;
  const turn = Math.atan2(-chamber.forward.x, -chamber.forward.z);
  const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  const cards = [
    { side: -1.92, kicker: 'LEAVE A LETTER', title: ['Send a message', 'to the artist'],
      line: 'anonymous  ·  up to 200 words', action: touch ? 'TAP WRITE' : 'PRESS  G', open: true },
    { side: 1.90, kicker: 'THE MAIL CLUB', title: ['Join the', 'mail club'],
      line: 'sign-ups are not open yet', action: 'COMING SOON', open: false }
  ];

  const made = cards.map((card) => {
    const material = new THREE.MeshBasicMaterial({
      map: draw(card), transparent: true, opacity: 0, depthWrite: false, toneMapped: false
    });
    material.color.setScalar(0.92);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 1.34 * H / W), material);
    // in front of the holograms they replace
    mesh.position.copy(at(card.side, 2.10, spec.desk + 1.07));
    mesh.rotation.y = turn - card.side * 0.09;
    mesh.renderOrder = 7;
    mesh.visible = false;
    group.add(mesh);
    return { card, mesh, material };
  });

  // the web fonts may arrive after the room: draw again once they have
  if (document.fonts) {
    Promise.all([document.fonts.load(`300 94px ${SERIF}`), document.fonts.load(`500 30px ${SANS}`)]).then(() => {
      for (const { card, material } of made) {
        const old = material.map;
        material.map = draw(card);
        old.dispose();
      }
    }).catch(() => {});
  }

  let shown = 0, last = 0;
  return {
    group,
    get showing() { return shown > 0.01; },
    /** `near` is 0 far away and 1 at the desk; the fade is eased over the clock `t`. */
    update(t, near) {
      const dt = Math.max(0, Math.min(0.1, t - last));
      last = t;
      shown += (near - shown) * (1 - Math.exp(-3.5 * dt));
      for (const { mesh, material } of made) {
        material.opacity = shown;
        mesh.visible = shown > 0.01;
      }
      for (const u of replaced) u.value = 1 - shown;
    },
    dispose() {
      for (const { mesh, material } of made) {
        material.map.dispose();
        material.dispose();
        mesh.geometry.dispose();
      }
      group.removeFromParent();
    }
  };
}

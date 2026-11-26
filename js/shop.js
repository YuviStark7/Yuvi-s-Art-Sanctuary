/**
 * The works for sale, read from Shopify as the room is hung.
 *
 * Product photos show the sheet of paper lying on a white backdrop. For a work to
 * hang at its true size the sheet has to be cut out of the photo, so `paperBox`
 * finds its edges: the rows and columns where much of the line is not backdrop.
 * The sheet's proportions are taken from the photo, so nothing is ever stretched;
 * its longer side is taken from the size written in the product description.
 */
import * as THREE from 'three';
import { SHOP } from './shop.config.js';

const PATIENCE = 6000;          // ms; a slow shop must not hold the door shut
const FALLBACK_LONG = 0.298;    // metres, if a description gives no size

const QUERY = `query Museo($handle: String!, $first: Int!) {
  collection(handle: $handle) {
    products(first: $first) { nodes {
      title availableForSale description descriptionHtml
      featuredImage { url(transform: { maxWidth: 1024, preferredContentType: JPG }) }
      variants(first: 1) { nodes { id availableForSale price { amount currencyCode } } }
    } }
  }
}`;

/** @returns the collection as gallery entries, or null to hang the placeholders. */
export async function loadShopWorks() {
  if (!SHOP.collection) return null;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PATIENCE);
  try {
    const res = await fetch(`https://${SHOP.domain}/api/${SHOP.apiVersion}/graphql.json`, {
      method: 'POST',
      credentials: 'omit',
      signal: abort.signal,
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': SHOP.token },
      body: JSON.stringify({ query: QUERY, variables: { handle: SHOP.collection, first: SHOP.limit } })
    });
    const json = await res.json();
    if (json.errors && json.errors.length) throw new Error(json.errors[0].message);
    const nodes = json.data?.collection?.products.nodes || [];
    const works = nodes.filter((p) => p.featuredImage && p.variants.nodes[0]).map(toWork);
    return works.length ? works : null;
  } catch (err) {
    console.warn('[Stark Museo] the shop could not be read; hanging the placeholders:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toWork(product) {
  const variant = product.variants.nodes[0];
  // parsed, never inserted: only the text of the description is ever used
  const doc = new DOMParser().parseFromString(product.descriptionHtml || '', 'text/html');
  const paragraphs = [...doc.querySelectorAll('p')].map((p) => p.textContent.trim());

  const text = product.description || '';
  const size = text.match(/(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*cm/i);
  const year = text.match(/·\s*((?:19|20)\d\d)/);
  const cm = size ? [size[1], size[2]].map((n) => parseFloat(n.replace(',', '.'))) : null;

  const amount = Number(variant.price.amount);
  const price = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: variant.price.currencyCode,
    minimumFractionDigits: amount % 1 ? 2 : 0
  }).format(amount);

  const available = product.availableForSale && variant.availableForSale;
  const id = variant.id.split('/').pop();

  return {
    framed: true,
    title: product.title,
    year: year ? year[1] : '',
    medium: doc.querySelector('em')?.textContent.trim() || '',
    cm,
    size: '',                   // written once the photo says which way up the sheet is
    note: paragraphs.slice(1).join(' '),
    image: product.featuredImage.url,
    price,
    available,
    // a plain link, so no browser can block it as a pop-up
    buyUrl: available && /^\d+$/.test(id) ? `https://${SHOP.storeHost}/cart/${id}:1` : ''
  };
}

/** Where the sheet of paper lies within the photo, as fractions [x, y, w, h]. */
function paperBox(img) {
  const W = 400;
  const H = Math.max(1, Math.round(W * img.height / img.width));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  const paper = (x, y) => {
    const i = (y * W + x) * 4;
    return Math.min(px[i], px[i + 1], px[i + 2]) < 246;
  };
  const span = (n, m, at) => {
    let first = -1, last = -1;
    for (let a = 0; a < n; a++) {
      let count = 0;
      for (let b = 0; b < m; b++) if (at(a, b)) count++;
      if (count / m > 0.35) { if (first < 0) first = a; last = a; }
    }
    return first < 0 ? [0, n] : [first, last + 1];
  };
  const [x0, x1] = span(W, H, (x, y) => paper(x, y));
  const [y0, y1] = span(H, W, (y, x) => paper(x, y));
  const box = [x0 / W, y0 / H, (x1 - x0) / W, (y1 - y0) / H];
  // a box this small means the edges were not found: better the whole photo than a sliver
  return box[2] > 0.3 && box[3] > 0.3 ? box : [0, 0, 1, 1];
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('timed out')), PATIENCE);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('could not load ' + url)); };
    img.src = url;
  });
}

function hang(work, canvas) {
  const aspect = canvas.width / canvas.height;
  const long = work.cm ? Math.max(...work.cm) / 100 : FALLBACK_LONG;
  work.width = aspect < 1 ? long * aspect : long;
  work.height = aspect < 1 ? long : long / aspect;
  if (work.cm) {
    const [short, tall] = [Math.min(...work.cm), Math.max(...work.cm)];
    work.size = aspect < 1 ? `${short} × ${tall} cm` : `${tall} × ${short} cm`;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, aspect };
}

/** Cuts each sheet out of its photo; also gives each work its size on the wall. */
export function loadShopTextures(works, onProgress) {
  let done = 0;
  return Promise.all(works.map(async (work) => {
    const canvas = document.createElement('canvas');
    try {
      const img = await loadImage(work.image);
      const [x, y, w, h] = paperBox(img);
      canvas.width = Math.round(w * img.width);
      canvas.height = Math.round(h * img.height);
      canvas.getContext('2d').drawImage(img, x * img.width, y * img.height, w * img.width, h * img.height,
        0, 0, canvas.width, canvas.height);
    } catch (err) {
      console.warn('[Stark Museo] photo missing for "' + work.title + '":', err.message);
      canvas.width = 420; canvas.height = 594;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#e9e5dc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    done++;
    if (onProgress) onProgress(done / works.length);
    return hang(work, canvas);
  }));
}

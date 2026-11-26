/**
 * ============================================================================
 *  WHICH WORKS HANG IN THE MUSEO — chosen in Shopify, not here.
 * ============================================================================
 *
 *  Add a work to the "Museo" collection in Shopify admin and it hangs on the
 *  next visit; remove it and it comes down. Title, price, "sold" and the photo
 *  all come from the product. The size comes from the description, written as
 *  "21 × 29.8 cm"; the year from "· 2025" after it.
 *
 *  If Shopify cannot be reached, or the collection is empty, the room hangs the
 *  placeholder works in artworks.js instead.
 *
 *  Everything here is public. The token is a Storefront token, the same one
 *  yuvistark.com already ships: it can only read the catalogue and build carts.
 */
export const SHOP = {
  /** The collection's handle. Empty to hang artworks.js instead. */
  collection: 'museo',

  domain: '1erwh1-5t.myshopify.com',
  token: '85a94c963114ba6b870d072041c95acf',
  apiVersion: '2026-01',

  /** Where "Buy" goes: Shopify's own cart and checkout. */
  storeHost: 'shop.yuvistark.com',

  /** The most works the wall will take. */
  limit: 24
};

/** How a work on paper is framed, in metres. The paper itself hangs true to size. */
export const FRAMING = {
  mat: 0.17,        // white board around the sheet
  rail: 0.028,      // width of the frame
  depth: 0.05,      // how far the frame stands off the wall
  frameColor: 0x1c1a18,
  matColor: 0xf4f2ee
};

# Partner logos

Chest prints for the wardrobe go here.

Use a **PNG with transparency**, roughly square, around 512px. Then point a
top at it in `js/artworks.js`... no — in `js/wardrobe.js`:

```js
{
  id: 'top-ecru',
  brand: 'YOUR PARTNER',
  name: 'Boxy Tee',
  color: 0xefe9dd,
  graphic: 'brands/partner.png',
  graphicScale: 0.20        // half-width in metres; 0.20 is a 40cm print
}
```

A missing file is skipped with a warning rather than breaking the rack.

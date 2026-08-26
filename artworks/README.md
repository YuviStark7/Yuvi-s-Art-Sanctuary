# Put your artwork files here

Drop your images into this folder, then list them in `js/artworks.js`.

```js
{
  src:    'artworks/my-piece.jpg',
  title:  'My Piece',
  year:   '2025',
  medium: 'Ink on cotton',
  size:   '120 x 120 cm',
  note:   'Shown when a visitor looks closely.',
  width:  1.4
}
```

`width` is the real width of the piece on the wall, in metres. The height is
taken from the image's own proportions, so nothing gets stretched.

Any format the browser can show works: .jpg, .png, .webp.
Around 2000px on the long edge is plenty.

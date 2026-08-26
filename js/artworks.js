/**
 * ============================================================================
 *  YOUR ARTWORKS — this is the only file you need to edit.
 * ============================================================================
 *
 *  1. Drop your image files into the /artworks folder.
 *  2. Fill in an entry below for each one.
 *
 *  Each entry:
 *
 *    src        Path to your image, e.g. 'artworks/untitled-01.jpg'.
 *               Leave it as null and a placeholder canvas is generated
 *               so the gallery still looks finished.
 *    title      Shown on the wall label and in the reading panel.
 *    year       Any string: '2024', '2023–24', ''.
 *    medium     'Ink on cotton', 'Oil on linen', 'Archival pigment print'…
 *    size       Free text shown on the label, e.g. '120 × 120 cm'.
 *    note       A sentence or two. Shown when a visitor opens the work.
 *    width      How wide the piece hangs, IN METRES. Be honest about this —
 *    height     it is what makes the room feel real. 1.6 is a large canvas.
 *
 *  Optional:
 *    angle      Where it hangs, in degrees around the room. Omit and the
 *               gallery spaces everything evenly along the free wall.
 *    place      'wall' (default) or 'chamber' to hang it in a side room.
 *
 *  Add or remove entries freely — the room re-hangs itself.
 */

export const ARTWORKS = [
  {
    src: null,
    title: 'Fracture I',
    year: '2024',
    medium: 'Ink on raw cotton',
    size: '150 × 150 cm',
    note: 'The first mark made after a long silence. Everything that followed in this room began here.',
    width: 1.70, height: 1.70
  },
  {
    src: null,
    title: 'Fracture II',
    year: '2024',
    medium: 'Ink on raw cotton',
    size: '150 × 150 cm',
    note: 'A single gesture, allowed to fall where it wanted to fall.',
    width: 1.70, height: 1.70
  },
  {
    src: null,
    title: 'Stillwater',
    year: '2023',
    medium: 'Ink and gesso on panel',
    size: '110 × 110 cm',
    note: 'Made facing a window during four days of rain.',
    width: 1.30, height: 1.30
  },
  {
    src: null,
    title: 'Threshold',
    year: '2023',
    medium: 'Ink on raw cotton',
    size: '180 × 140 cm',
    note: 'The largest of the series, and the quietest.',
    width: 2.00, height: 1.55
  },
  {
    src: null,
    title: 'Root Study',
    year: '2022',
    medium: 'Ink on paper, mounted',
    size: '90 × 90 cm',
    note: 'Drawn from the base of an olive tree that had stood for three hundred years.',
    width: 1.05, height: 1.05
  },
  {
    src: null,
    title: 'Descent',
    year: '2024',
    medium: 'Ink on raw cotton',
    size: '150 × 200 cm',
    note: 'Hung deliberately opposite the falling water.',
    width: 1.55, height: 2.05
  },
  {
    src: null,
    title: 'Small Weather',
    year: '2022',
    medium: 'Ink on paper, mounted',
    size: '70 × 70 cm',
    note: '',
    width: 0.85, height: 0.85
  },
  {
    src: null,
    title: 'Fracture III',
    year: '2025',
    medium: 'Ink on raw cotton',
    size: '150 × 150 cm',
    note: 'Unfinished, and shown that way.',
    width: 1.70, height: 1.70
  },
  {
    src: null,
    title: 'Quiet Ground',
    year: '2021',
    medium: 'Pigment and ash on panel',
    size: '100 × 130 cm',
    note: '',
    width: 1.15, height: 1.48,
    place: 'chamber'
  },
  {
    src: null,
    title: 'Held Breath',
    year: '2025',
    medium: 'Ink on raw cotton',
    size: '120 × 120 cm',
    note: 'The most recent work in the sanctuary.',
    width: 1.35, height: 1.35,
    place: 'chamber'
  }
];

/** Text shown on the entrance card and in the About panel. */
export const EXHIBITION = {
  name: 'STARK MUSEO',
  subtitle: 'A sanctuary for stillness',
  artist: '',
  statement:
    'A single tree stands on rock, ringed by water, beneath an opening in the concrete. ' +
    'The works are hung far apart and lit only by the sky. ' +
    'There is nowhere in particular to go. Walk slowly.',
  credit: ''
};

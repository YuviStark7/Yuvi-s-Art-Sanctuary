/**
 * ============================================================================
 *  THE WARDROBE — brand placements go here.
 * ============================================================================
 *
 *  Visitors choose a figure and dress it before they walk into the sanctuary.
 *  There are two figures, a man and a woman, each a 3D model built from CC0
 *  parts (see tools/human/). Each figure has outfits, and each outfit carries a
 *  brand name, so a partner's tailoring goes into FIGURES below.
 *
 *  WARDROBE (tops, bottoms, shoes, hats) is the older, procedural wardrobe. It is
 *  only used if the 3D figure fails to load and js/character.procedural.js takes
 *  over, which is why it is still here.
 *
 *  Every entry takes:
 *
 *    id       A short unique string. Never shown; used to remember choices.
 *    brand    The label shown above the item name. Leave '' for none.
 *    name     What the item is called.
 *    color    Main colour, as 0xRRGGBB.
 *    trim     Optional second colour — collar and cuffs, sole, brim, waistband.
 *    graphic  Optional image printed on the chest, e.g. 'brands/acme.png'.
 *             Use a PNG with transparency. Tops only.
 *    note     Optional line shown under the name — fabric, drop, collection.
 *
 *  ----------------------------------------------------------------------
 *  IMPORTANT: the names below are placeholders, deliberately generic. Put
 *  your partners' real names in `brand`, drop their logo PNGs into /brands,
 *  and point `graphic` at them. Nothing here implies a real brand.
 *  ----------------------------------------------------------------------
 */

/**
 * The figure itself. `hair` is the colour that goes with each tone — change
 * it freely, or set them all the same if you would rather not tie the two.
 */
export const FIGURE = {
  tones: [
    { id: 'tone-1', color: 0xe8cdb4, hair: 0x6b4a2c },
    { id: 'tone-2', color: 0xd2a884, hair: 0x4a3323 },
    { id: 'tone-3', color: 0xa87551, hair: 0x33241a },
    { id: 'tone-4', color: 0x6f4a33, hair: 0x241a14 },
    { id: 'tone-5', color: 0x47301f, hair: 0x1a1310 }
  ],
  defaultTone: 1
};

/**
 * The two figures and what each can wear.
 *
 * An outfit is a garment set that lives inside the figure's .glb, so adding one
 * means building it (tools/human/characters.mjs) and listing it here. `color`
 * and `trim` are only the swatch shown on the wardrobe screen.
 */
export const FIGURES = [
  {
    id: 'male',
    name: 'Man',
    note: 'Classic cut',
    model: './models/figure-male.glb',
    color: 0x2a2d3a,
    outfits: [
      { id: 'tuxedo', brand: 'BRAND ONE', name: 'Dinner jacket', note: 'White, satin shawl lapel', color: 0xefece6, trim: 0x15151a },
      { id: 'suit', brand: 'BRAND TWO', name: 'Navy suit', note: 'Pinstripe wool', color: 0x1d2540, trim: 0xc23a3f }
    ]
  },
  {
    id: 'female',
    name: 'Woman',
    note: 'Classic cut',
    model: './models/figure-female.glb',
    color: 0x3a2d33,
    outfits: [
      { id: 'suit', brand: 'BRAND ONE', name: 'Double-breasted suit', note: 'Charcoal wool', color: 0x2c2b35, trim: 0x7a1d2e },
      { id: 'skirt', brand: 'BRAND TWO', name: 'Skirt suit', note: 'Black, tailored', color: 0x222226, trim: 0xe8e4de }
    ]
  }
];

export function figureById(id) {
  return FIGURES.find((f) => f.id === id) || FIGURES[0];
}

export const WARDROBE = {

  /* ---------------------------------------------------------------- tops */
  tops: [
    {
      id: 'top-ecru',
      brand: 'BRAND ONE',
      name: 'Boxy Tee',
      note: 'Heavyweight cotton',
      color: 0xefe9dd,
      trim: 0xe2dacb,
      graphic: null,
      sleeve: 'short'
    },
    {
      id: 'top-ink',
      brand: 'BRAND TWO',
      name: 'Long Sleeve',
      note: 'Washed jersey',
      color: 0x24262a,
      trim: 0x34373c,
      graphic: null,
      sleeve: 'long'
    }
  ],

  /* ------------------------------------------------------------- bottoms */
  bottoms: [
    {
      id: 'btm-stone',
      brand: 'BRAND ONE',
      name: 'Wide Trouser',
      note: 'Dry cotton twill',
      color: 0xbdb5a6,
      trim: 0xa9a192,
      cut: 'wide'
    },
    {
      id: 'btm-indigo',
      brand: 'BRAND TWO',
      name: 'Straight Denim',
      note: 'Raw indigo',
      color: 0x3b4a63,
      trim: 0x2e3a4e,
      cut: 'straight'
    }
  ],

  /* --------------------------------------------------------------- shoes */
  shoes: [
    {
      id: 'shoe-white',
      brand: 'BRAND THREE',
      name: 'Low Trainer',
      note: 'Full-grain leather',
      color: 0xf2f0ea,
      trim: 0xd8d4c9
    },
    {
      id: 'shoe-black',
      brand: 'BRAND THREE',
      name: 'Derby',
      note: 'Polished calf',
      color: 0x1e1f22,
      trim: 0x101113
    }
  ],

  /* ---------------------------------------------------------------- hats */
  hats: [
    { id: 'hat-none', brand: '', name: 'Bare head', style: 'none' },
    {
      id: 'hat-cap',
      brand: 'BRAND FOUR',
      name: 'Six-Panel Cap',
      note: 'Brushed cotton',
      color: 0x2b2f36,
      trim: 0x1e2127,
      style: 'cap'
    },
    {
      id: 'hat-bucket',
      brand: 'BRAND FOUR',
      name: 'Bucket Hat',
      note: 'Garment dyed',
      color: 0xb9ae97,
      trim: 0xa2977f,
      style: 'bucket'
    }
  ],

  /* ------------------------------------------------------- what you hold */
  hands: [
    { id: 'hand-none', brand: '', name: 'Empty hands', style: 'none' },
    {
      id: 'hand-wine',
      brand: '',
      name: 'Glass of wine',
      note: 'Press G to drink',
      style: 'wine',
      verb: 'drink'
    },
    {
      id: 'hand-polaroid',
      brand: '',
      name: 'Instant camera',
      note: 'Press G to take a picture',
      style: 'polaroid',
      verb: 'photograph'
    },
    {
      id: 'hand-cigarette',
      brand: '',
      name: 'Cigarette',
      note: 'Press G to take a draw',
      style: 'cigarette',
      verb: 'smoke'
    }
  ]
};

/** What a visitor arrives wearing before they touch anything. */
export const DEFAULT_OUTFIT = {
  body: 'male',
  outfit: 'tuxedo',
  tone: 'tone-2',
  top: 'top-ecru',
  bottom: 'btm-stone',
  shoe: 'shoe-white',
  hat: 'hat-none',
  hand: 'hand-wine'
};

/** Copy shown on the wardrobe screen. */
export const WARDROBE_COPY = {
  title: 'Before you go in',
  intro: 'Choose who goes in, and dress for the visit. What you carry, you can use — press G once you are inside.',
  enter: 'Enter the sanctuary'
};

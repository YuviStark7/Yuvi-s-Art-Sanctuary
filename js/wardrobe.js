/**
 * ============================================================================
 *  THE WARDROBE — brand placements go here.
 * ============================================================================
 *
 *  Visitors dress a figure before they walk into the sanctuary. Each entry
 *  below is one garment, and each garment can carry a brand name and a chest
 *  graphic. Everything is generated from these numbers — no 3D files.
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
  intro: 'Dress for the visit. What you carry, you can use — press G once you are inside.',
  enter: 'Enter the sanctuary'
};

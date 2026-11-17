/**
 * The two figures: which body, which face and hair, which clothes.
 * Paths are relative to 3D Objects/makehuman-src/assets/ (see fetch.mjs).
 */
const SUITS = 'suits01/clothes';

export const CHARACTERS = {
  male: {
    gender: 1, race: { caucasian: 1 }, height: 1.80,
    skin: 'skins/young_caucasian_male/young_lightskinned_male_diffuse.png',
    eye: 'brown', eyeVf: 'eq=saturation=0.50:brightness=0.03', brows: 'eyebrow002', lashes: 'eyelashes01', hair: 'short02', shoes: 'shoes04',
    outfits: {
      tuxedo: { suit: `${SUITS}/toigo_suit_with_dinner_jacket/toigo_suit_with_dinner_jacket.mhclo`, label: 'White dinner jacket' },
      suit: { suit: `${SUITS}/toigo_male_suit_3/toigo_male_suit_3.mhclo`, label: 'Navy suit' }
    }
  },
  female: {
    gender: 0, race: { caucasian: 1 }, height: 1.68,
    skin: 'skins/young_caucasian_female/young_lightskinned_female_diffuse.png',
    eye: 'brownlight', eyeVf: 'eq=saturation=0.85', brows: 'eyebrow008', lashes: 'eyelashes02', hair: 'ponytail01', shoes: 'shoes04',
    outfits: {
      suit: { suit: `${SUITS}/toigo_female_double-breasted_suit/toigo_female_double-breasted_suit.mhclo`, label: 'Double-breasted suit' },
      skirt: { suit: `${SUITS}/toigo_female_suit/toigo_female_suit.mhclo`, label: 'Skirt suit' }
    }
  }
};

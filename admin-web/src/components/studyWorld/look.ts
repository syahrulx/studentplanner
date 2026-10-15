import { DEFAULT_LOOK, type AvatarLook } from '../../vendor/study-world/avatar';

/** Which part of the avatar each item category dresses. */
export const LOOK_FIELD: Record<string, keyof AvatarLook> = {
  hair: 'hair', eyes: 'eyes', top: 'top', bottom: 'bottom', shoes: 'shoes',
  head: 'head', face: 'face', back: 'back', pet: 'pet', effect: 'effect', hair_dye: 'hairColor',
};

/** The default avatar wearing every avatar piece in the list (e.g. a whole bundle). */
export function lookWearing(pieces: { category: string; item_key: string }[]): AvatarLook {
  const look: AvatarLook = { ...DEFAULT_LOOK };
  for (const piece of pieces) {
    const field = LOOK_FIELD[piece.category];
    if (field) (look as Record<keyof AvatarLook, unknown>)[field] = piece.item_key;
  }
  return look;
}

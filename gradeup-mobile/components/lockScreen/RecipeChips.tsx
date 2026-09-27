import { StyleSheet, Text, View } from 'react-native';

import { withAlpha } from '@/src/lib/contrast';
import { LOCK_SHORTCUT_NAME } from '@/src/lib/lockScreen/lockScreenShortcut';

/**
 * The taps that build one Shortcuts automation, drawn as a path of chips
 * (setup step 3, iOS 16–26).
 *
 * The labels are Apple's own UI names and stay in English whatever the app
 * language, exactly as the ls* copy refers to them, so a student can match
 * each chip to the button in front of them.
 */

export type LockRecipe = 'morning' | 'close';

const RECIPES: Record<'ios16' | 'ios17', Record<LockRecipe, readonly string[]>> = {
  // iOS 17–26: + opens the trigger list, and the automation runs the shortcut directly.
  ios17: {
    morning: ['Automation', '+', 'Time of Day', '6:00 AM', 'Daily', 'Run Immediately', 'Next', LOCK_SHORTCUT_NAME],
    close: ['Automation', '+', 'App', 'Rencana', 'Is Closed', 'Run Immediately', 'Next', LOCK_SHORTCUT_NAME],
  },
  // iOS 16: an automation runs actions, so the shortcut goes in through Run Shortcut.
  ios16: {
    morning: [
      'Automation',
      'Create Personal Automation',
      'Time of Day',
      '6:00 AM',
      'Daily',
      'Next',
      'Add Action',
      'Run Shortcut',
      LOCK_SHORTCUT_NAME,
      'Next',
    ],
    close: [
      'Automation',
      'Create Personal Automation',
      'App',
      'Rencana',
      'Is Closed',
      'Next',
      'Add Action',
      'Run Shortcut',
      LOCK_SHORTCUT_NAME,
      'Next',
    ],
  },
};

/** The chip path for one recipe. iOS 27 adds triggers inside the shortcut instead, so it has none. */
export function recipeChipsFor(iosMajor: number, recipe: LockRecipe): readonly string[] {
  return RECIPES[iosMajor >= 17 ? 'ios17' : 'ios16'][recipe];
}

export interface RecipeChipsProps {
  chips: readonly string[];
  /** Tints the chip that names our shortcut, the one step students most often get wrong. */
  accent?: string;
}

export default function RecipeChips({ chips, accent }: RecipeChipsProps) {
  const highlight = accent ? { backgroundColor: withAlpha(accent, '2E'), borderColor: withAlpha(accent, '73') } : null;
  return (
    <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={chips.join(', ')}>
      {chips.map((label, i) => (
        // The separator travels with the chip after it, so a wrapped line never starts with "›".
        <View key={`${i}:${label}`} style={styles.item}>
          {i > 0 ? <Text style={styles.separator}>›</Text> : null}
          <View style={[styles.chip, label === LOCK_SHORTCUT_NAME && highlight]}>
            <Text style={styles.chipText}>{label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  separator: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '700',
    marginHorizontal: 5,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 8,
    // 4/8 including the border, which stays transparent until highlighted so
    // the highlighted chip keeps the same size.
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});

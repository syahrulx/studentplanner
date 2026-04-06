import { useCallback, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/**
 * While the screen is focused: re-render on an interval and when the app becomes active,
 * so time-based UI (e.g. current class under Studying) stays in sync.
 */
export function useWallClockTick(intervalMs = 30_000): void {
  const [, setTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const bump = () => setTick((t) => t + 1);
      bump();
      const id = setInterval(bump, intervalMs);
      const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
        if (s === 'active') bump();
      });
      return () => {
        clearInterval(id);
        sub.remove();
      };
    }, [intervalMs]),
  );
}

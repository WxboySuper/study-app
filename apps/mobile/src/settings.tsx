import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

import type { BaitId } from '@study-app/core';

import { setHapticsEnabled } from './modes/fishing/haptics';
import { setSfxEnabled } from './modes/fishing/sfx';

/**
 * The settings of the app.
 *
 * They live in memory for now: the mode is the only place they are used, and
 * the session is short enough for that. Persisting them (SQLite or
 * AsyncStorage) is a follow up.
 */

/** What the player studies: everything, one topic or one set. */
export type ScopeChoice =
  | { kind: 'all' }
  | { kind: 'topic'; id: string; title: string }
  | { kind: 'set'; id: string; title: string };

/** A readable name of a scope. */
export function scopeTitle(scope: ScopeChoice): string {
  switch (scope.kind) {
    case 'all':
      return 'All';
    case 'topic':
      return `Topic: ${scope.title}`;
    case 'set':
      return `Set: ${scope.title}`;
  }
}

interface SettingsContextValue {
  sound: boolean;
  haptics: boolean;
  autoReel: boolean;
  /** `null` means "follow the system setting". */
  reduceMotion: boolean | null;
  /** The scope of the last session, so "Play again" is one tap. */
  scope: ScopeChoice;
  /** The bait that is equipped for the next session. */
  bait: BaitId | null;
  /** The reduce motion setting of the system. */
  systemReduceMotion: boolean;
  setSound: (value: boolean) => void;
  setHaptics: (value: boolean) => void;
  setAutoReel: (value: boolean) => void;
  setReduceMotion: (value: boolean | null) => void;
  setScope: (value: ScopeChoice) => void;
  setBait: (value: BaitId | null) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [sound, setSound] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [autoReel, setAutoReel] = useState(true);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [scope, setScope] = useState<ScopeChoice>({ kind: 'all' });
  const [bait, setBait] = useState<BaitId | null>(null);
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setSystemReduceMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setSystemReduceMotion(enabled);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    setSfxEnabled(sound);
  }, [sound]);

  useEffect(() => {
    setHapticsEnabled(haptics);
  }, [haptics]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      sound,
      haptics,
      autoReel,
      reduceMotion,
      scope,
      bait,
      systemReduceMotion,
      setSound,
      setHaptics,
      setAutoReel,
      setReduceMotion,
      setScope,
      setBait,
    }),
    [sound, haptics, autoReel, reduceMotion, scope, bait, systemReduceMotion],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** The settings of the app. */
export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (value === null) {
    throw new Error('useSettings has to be used inside a SettingsProvider.');
  }
  return value;
}

/**
 * Whether the animations have to be reduced.
 *
 * The player can force the setting, and the system setting is the default.
 */
export function useReduceMotion(): boolean {
  const { reduceMotion, systemReduceMotion } = useSettings();
  return reduceMotion ?? systemReduceMotion;
}

/** A callback that toggles the sound. */
export function useToggleSound(): () => void {
  const { sound, setSound } = useSettings();
  return useCallback(() => {
    setSound(!sound);
  }, [sound, setSound]);
}

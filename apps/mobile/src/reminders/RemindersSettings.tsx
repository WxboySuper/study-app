import { formatReminderTime, shiftReminderTime, type ReminderTime } from '@study-app/core';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  DEFAULT_REMINDER_SETTINGS,
  readReminderSettings,
  saveReminderSettings,
  type ReminderSettings,
} from '@/notifications';
import { colors, fonts, radius } from '@/theme';

/**
 * The reminder settings of the home screen: a switch, a time stepper and the
 * evening nudge of the streak. Hidden on the web, where there is nothing to
 * schedule.
 */
export function RemindersSettings() {
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let live = true;
    void readReminderSettings().then((loaded) => {
      if (live) {
        setSettings(loaded);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  if (Platform.OS === 'web') {
    return null;
  }

  const update = (next: ReminderSettings) => {
    setSettings(next);
    setDenied(false);
    void saveReminderSettings(next).then((granted) => {
      if (!granted) {
        setDenied(true);
        setSettings({ ...next, enabled: false });
      }
    });
  };

  const step = (key: 'time' | 'eveningTime', minutes: number) => {
    const shifted: ReminderTime = shiftReminderTime(settings[key], minutes);
    update({ ...settings, [key]: shifted });
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Daily reminder</Text>

      <Row label="Remind me to study">
        <Chip on={settings.enabled} onPress={() => update({ ...settings, enabled: !settings.enabled })} />
      </Row>

      {denied ? (
        <Text style={styles.warn}>
          Notifications are blocked. Allow them for CramCritters in your phone settings.
        </Text>
      ) : null}

      {settings.enabled ? (
        <>
          <Row label="Time">
            <Stepper
              value={formatReminderTime(settings.time)}
              onMinus={() => step('time', -30)}
              onPlus={() => step('time', 30)}
              label="reminder time"
            />
          </Row>
          <Row label="Evening streak nudge">
            <Chip
              on={settings.eveningEnabled}
              onPress={() => update({ ...settings, eveningEnabled: !settings.eveningEnabled })}
            />
          </Row>
          {settings.eveningEnabled ? (
            <Row label="Nudge time">
              <Stepper
                value={formatReminderTime(settings.eveningTime)}
                onMinus={() => step('eveningTime', -30)}
                onPlus={() => step('eveningTime', 30)}
                label="evening nudge time"
              />
            </Row>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
    >
      <Text style={styles.chipText}>{on ? 'on' : 'off'}</Text>
    </Pressable>
  );
}

function Stepper({
  value,
  onMinus,
  onPlus,
  label,
}: {
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  label: string;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Earlier ${label}`}
        onPress={onMinus}
        style={styles.stepButton}
      >
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Later ${label}`}
        onPress={onPlus}
        style={styles.stepButton}
      >
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 6,
    paddingTop: 6,
  },
  title: {
    color: colors.textMuted,
    fontFamily: fonts.titleSemi,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  label: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
  },
  warn: {
    color: colors.danger,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  chip: {
    borderRadius: radius.chip,
    paddingHorizontal: 14,
    paddingVertical: 5,
    minWidth: 56,
    alignItems: 'center',
  },
  chipOn: { backgroundColor: colors.collection },
  chipOff: { backgroundColor: 'rgba(255,255,255,0.08)' },
  chipText: { color: '#ffffff', fontFamily: fonts.title, fontSize: 12 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  stepText: { color: colors.text, fontFamily: fonts.title, fontSize: 18 },
  stepValue: {
    minWidth: 76,
    textAlign: 'center',
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 15,
  },
});

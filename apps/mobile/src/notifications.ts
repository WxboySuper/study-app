import {
  countScope,
  nextReminderTime,
  reminderText,
  streakRiskText,
  type ReminderTime,
} from '@study-app/core';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { openLocalStore } from '@/db/local';
import type { LocalStore } from '@/db/types';

/**
 * Study reminders.
 *
 * They are local notifications, there is no push server. A notification
 * cannot be recomputed in the background, so the app schedules the next seven
 * days every time it opens: the first one carries today's real due count, the
 * rest are generic. Opening the app again rewrites them.
 */

const SETTINGS_KEY = 'reminders.v1';
const CHANNEL_ID = 'study-reminders';
const DAYS_AHEAD = 7;

/** The settings of the reminders. */
export interface ReminderSettings {
  enabled: boolean;
  /** The time of the daily review reminder. */
  time: ReminderTime;
  /** The evening reminder when the streak is at risk. */
  eveningEnabled: boolean;
  eveningTime: ReminderTime;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  time: { hour: 18, minute: 0 },
  eveningEnabled: true,
  eveningTime: { hour: 20, minute: 30 },
};

/** What the app knows when it refreshes the reminders. */
export interface ReminderContext {
  /** The current daily streak. */
  streak?: number;
  /** `true` when today's goal is already done (no evening nudge today). */
  goalDoneToday?: boolean;
  /** How many questions are left for today's goal. */
  remaining?: number;
}

/** Asks for the notification permission. Returns whether it was granted. */
export async function requestPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

/** Returns the Expo push token of this device, if there is one. */
export async function getExpoPushToken(): Promise<string | null> {
  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
}

/** Reads the saved settings (the defaults when there are none). */
export async function readReminderSettings(store?: LocalStore): Promise<ReminderSettings> {
  try {
    const local = store ?? (await openLocalStore());
    const raw = await local.readKv(SETTINGS_KEY);
    if (raw === null) {
      return DEFAULT_REMINDER_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<ReminderSettings>;
    return {
      enabled: parsed.enabled === true,
      time: validTime(parsed.time) ?? DEFAULT_REMINDER_SETTINGS.time,
      eveningEnabled: parsed.eveningEnabled !== false,
      eveningTime: validTime(parsed.eveningTime) ?? DEFAULT_REMINDER_SETTINGS.eveningTime,
    };
  } catch {
    return DEFAULT_REMINDER_SETTINGS;
  }
}

/** Saves the settings and reschedules the reminders. */
export async function saveReminderSettings(
  settings: ReminderSettings,
  context: ReminderContext = {},
): Promise<boolean> {
  const store = await openLocalStore();
  await store.writeKv(SETTINGS_KEY, JSON.stringify(settings));

  if (!settings.enabled) {
    await cancelReminders();
    return true;
  }

  const granted = await requestPermission();
  if (!granted) {
    await store.writeKv(SETTINGS_KEY, JSON.stringify({ ...settings, enabled: false }));
    await cancelReminders();
    return false;
  }

  await scheduleReminders(settings, context, store);
  return true;
}

/** Cancels every reminder. */
export async function cancelReminders(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Rewrites the scheduled reminders with today's numbers.
 *
 * Called when the app opens and after a session. Never throws.
 */
export async function refreshReminderContent(context: ReminderContext = {}): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const store = await openLocalStore();
    const settings = await readReminderSettings(store);
    if (!settings.enabled) {
      return;
    }
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted') {
      return;
    }
    await scheduleReminders(settings, context, store);
  } catch {
    // A reminder is a nicety: it never breaks the app.
  }
}

async function scheduleReminders(
  settings: ReminderSettings,
  context: ReminderContext,
  store: LocalStore,
): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Study reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = new Date();
  const due = await dueCount(store, now);
  const streak = context.streak ?? 0;
  const first = reminderText(due, streak);
  const generic = {
    title: 'Your review is ready',
    body: streak > 0 ? `Keep day ${streak + 1} going.` : 'A few minutes now beats a cram later.',
  };

  const morning = nextReminderTime(settings.time, now);
  for (let day = 0; day < DAYS_AHEAD; day += 1) {
    const at = new Date(morning);
    at.setDate(at.getDate() + day);
    await schedule(at, day === 0 ? first : generic);
  }

  if (settings.eveningEnabled) {
    const evening = nextReminderTime(settings.eveningTime, now);
    for (let day = 0; day < DAYS_AHEAD; day += 1) {
      const at = new Date(evening);
      at.setDate(at.getDate() + day);
      // Today's evening nudge is skipped when the goal is already done.
      const isToday = at.toDateString() === now.toDateString();
      if (isToday && context.goalDoneToday === true) {
        continue;
      }
      await schedule(
        at,
        streak > 0
          ? streakRiskText(streak, context.remaining ?? 5)
          : { title: 'Still time to study', body: 'Ten questions today starts a streak.' },
      );
    }
  }
}

async function schedule(at: Date, content: { title: string; body: string }): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title: content.title, body: content.body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId: CHANNEL_ID,
    },
  });
}

async function dueCount(store: LocalStore, now: Date): Promise<number> {
  const [cards, states] = await Promise.all([store.listCards(), store.listCardStates()]);
  return countScope(cards, states, now, { kind: 'all' }).due;
}

function validTime(value: unknown): ReminderTime | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { hour, minute } = value as Record<string, unknown>;
  if (
    typeof hour === 'number' &&
    typeof minute === 'number' &&
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour < 24 &&
    minute >= 0 &&
    minute < 60
  ) {
    return { hour, minute };
  }
  return null;
}

/**
 * The text of the study reminders.
 *
 * The app schedules local notifications. The content cannot be recomputed in
 * the background, so the app rewrites the next reminder every time it opens,
 * with the due count of that moment. This module is the pure part: the copy.
 */

/** About how long one card takes, in minutes (a quarter of a minute). */
export const MINUTES_PER_CARD = 0.25;

/** A notification. */
export interface ReminderText {
  title: string;
  body: string;
}

/** A reminder time of the day. */
export interface ReminderTime {
  hour: number;
  minute: number;
}

/** "about 8 min" for a number of cards. */
export function estimateMinutes(cards: number): number {
  return Math.max(1, Math.round(cards * MINUTES_PER_CARD));
}

/**
 * The morning reminder: what is due and how long it takes.
 *
 * @param due How many cards are due.
 * @param streak The current daily streak (0 when there is none).
 */
export function reminderText(due: number, streak: number): ReminderText {
  const safeDue = Math.max(0, Math.floor(due));
  const days = Math.max(0, Math.floor(streak));

  if (safeDue === 0) {
    return {
      title: 'Nothing due today',
      body:
        days > 0
          ? `A quick 5 keeps day ${days + 1} alive.`
          : 'A quick 5 is a good way to start a streak.',
    };
  }

  const minutes = estimateMinutes(safeDue);
  const cards = `${safeDue} card${safeDue === 1 ? '' : 's'}`;
  return {
    title: `${cards} due · about ${minutes} min`,
    body: days > 0 ? `Day ${days} is on the line. Clear it before it slips.` : 'Clear them while they are fresh.',
  };
}

/** The evening reminder that fires when the streak is at risk. */
export function streakRiskText(streak: number, remaining: number): ReminderText {
  const days = Math.max(1, Math.floor(streak));
  const left = Math.max(1, Math.floor(remaining));
  return {
    title: `Day ${days} ends tonight`,
    body: `${left} more question${left === 1 ? '' : 's'} keeps the streak.`,
  };
}

/** The next moment (in ms since the epoch) at which `time` happens after `now`. */
export function nextReminderTime(time: ReminderTime, now: Date): Date {
  const next = new Date(now);
  next.setHours(time.hour, time.minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

/** "8:30 PM" for a reminder time. */
export function formatReminderTime(time: ReminderTime): string {
  const hour12 = time.hour % 12 === 0 ? 12 : time.hour % 12;
  const suffix = time.hour < 12 ? 'AM' : 'PM';
  return `${hour12}:${String(time.minute).padStart(2, '0')} ${suffix}`;
}

/** Moves a time by some minutes and wraps around midnight. */
export function shiftReminderTime(time: ReminderTime, minutes: number): ReminderTime {
  const total = (((time.hour * 60 + time.minute + minutes) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

import { openLocalStore } from '@/db/local';

const COMPANION_KEY = 'companion-v1';

type Listener = (critterId: string | null) => void;
const listeners = new Set<Listener>();

/** The critter that rides along on the home screen (`null` when none is chosen). */
export async function readCompanion(): Promise<string | null> {
  try {
    const store = await openLocalStore();
    const value = await store.readKv(COMPANION_KEY);
    return value === null || value === '' ? null : value;
  } catch {
    return null;
  }
}

/** Chooses the companion (`null` clears it). */
export async function saveCompanion(critterId: string | null): Promise<void> {
  try {
    const store = await openLocalStore();
    await store.writeKv(COMPANION_KEY, critterId ?? '');
    listeners.forEach((listener) => listener(critterId));
  } catch {
    // The companion is cosmetic: a failed save changes nothing.
  }
}

/** Calls `listener` whenever the companion changes. */
export function subscribeCompanion(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

import * as DocumentPicker from 'expo-document-picker';

import { withoutExtension, type PickedFile } from './deck';

/**
 * The sources a deck can come from, in the browser.
 *
 * The clipboard of the browser is `navigator.clipboard`, and the file picker
 * of the browser is a plain `<input type="file">` (which is what
 * `expo-document-picker` uses on the web).
 */

/** The kinds of file the picker offers (a JSON deck or a plain text one). */
const FILE_TYPES = ['application/json', 'text/plain', 'text/*'];

/** The part of the clipboard of the browser the app uses. */
interface WebClipboard {
  readText: () => Promise<string>;
}

/** The clipboard of the browser, when the browser has one. */
function webClipboard(): WebClipboard | null {
  const nav = (globalThis as { navigator?: { clipboard?: WebClipboard } }).navigator;
  return nav?.clipboard ?? null;
}

/**
 * Reads the text of the clipboard of the browser.
 *
 * The browser asks for the permission to read the clipboard, and it can
 * refuse: it then throws, and the screen shows its friendly error.
 */
export async function readClipboardText(): Promise<string> {
  const clipboard = webClipboard();

  if (clipboard === null) {
    throw new Error('The clipboard is not available in this browser.');
  }

  return clipboard.readText();
}

/**
 * Opens the file picker of the browser and reads the deck of the picked file.
 *
 * `null` means the player did not pick any file.
 */
export async function pickDeckFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: FILE_TYPES,
    multiple: false,
    base64: false,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  if (asset === undefined || asset.file === undefined) {
    return null;
  }

  const text = await asset.file.text();

  return { text, name: withoutExtension(asset.name) };
}

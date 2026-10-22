import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { withoutExtension, type PickedFile } from './deck';

/**
 * The sources a deck can come from, on the phone.
 *
 * The phone reads the clipboard of the system and opens the file picker of
 * the system. The browser has its own (much smaller) version of this file:
 * `sources.web.ts`.
 */

/** The kinds of file the picker offers (a JSON deck or a plain text one). */
const FILE_TYPES = ['application/json', 'text/plain', 'text/*'];

/**
 * Reads the text of the clipboard.
 *
 * It throws when the clipboard cannot be read at all; the screen then shows
 * its friendly error.
 */
export async function readClipboardText(): Promise<string> {
  return Clipboard.getStringAsync();
}

/**
 * Opens the file picker and reads the deck of the picked file.
 *
 * `null` means the player did not pick any file.
 */
export async function pickDeckFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: FILE_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  if (asset === undefined) {
    return null;
  }

  const file = new File(asset.uri);
  const text = await file.text();

  return { text, name: withoutExtension(asset.name) };
}

import { Directory, File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

import { openReleasePage, type AvailableUpdate } from './checkForUpdate';

/**
 * The update from the banner: download the APK and open the installer.
 *
 * The Worker streams the APK of the release (`GET /api/update/apk`), so the
 * phone never talks to GitHub. The file is kept in the cache of the app and
 * handed to the Android package installer with a content URI and the
 * read permission flag.
 *
 * Anything that goes wrong (an iOS phone, no APK in the release, a download
 * that fails, an installer that does not open) falls back to the page of the
 * release in the browser, so the player can always download the update.
 */

/** The MIME of an Android package. */
export const APK_MIME = 'application/vnd.android.package-archive';

/** Android's `Intent.FLAG_GRANT_READ_URI_PERMISSION`. */
export const GRANT_READ_URI_PERMISSION = 0x00000001;

/** The action that opens a file with the app that handles its MIME. */
export const ACTION_VIEW = 'android.intent.action.VIEW';

/** A step of the download, for the progress bar of the banner. */
export interface UpdateDownloadProgress {
  /** Bytes written so far. */
  bytesWritten: number;
  /** The expected size, or `null` when the server did not send one. */
  totalBytes: number | null;
  /** The part of the file that is there, from 0 to 1 (`null` when unknown). */
  ratio: number | null;
}

/** What happened to the tap of the player. */
export type UpdateInstallResult = 'installing' | 'fallback';

/**
 * Downloads the APK of the release and opens the Android installer.
 *
 * The progress callback is called while the file downloads. The function
 * resolves with `'installing'` when the installer was started (the player
 * still confirms the install) and with `'fallback'` when the release page
 * was opened instead.
 */
export async function installUpdate(
  update: AvailableUpdate,
  onProgress?: (progress: UpdateDownloadProgress) => void,
): Promise<UpdateInstallResult> {
  if (Platform.OS !== 'android' || update.apkUrl === null || update.apkUrl === '') {
    await openReleasePage(update);
    return 'fallback';
  }

  try {
    const folder = new Directory(Paths.cache, 'updates');
    folder.create({ intermediates: true, idempotent: true });

    const name = `cramcritters-${update.version.replace(/[^0-9A-Za-z._-]/g, '')}.apk`;
    const target = new File(folder, name);
    const file = await File.downloadFileAsync(update.apkUrl, target, {
      idempotent: true,
      onProgress: (progress) => {
        const total = progress.totalBytes > 0 ? progress.totalBytes : null;
        onProgress?.({
          bytesWritten: progress.bytesWritten,
          totalBytes: total,
          ratio:
            total === null ? null : Math.max(0, Math.min(1, progress.bytesWritten / total)),
        });
      },
    });

    const contentUri = await getContentUriAsync(file.uri);
    await IntentLauncher.startActivityAsync(ACTION_VIEW, {
      data: contentUri,
      flags: GRANT_READ_URI_PERMISSION,
      type: APK_MIME,
    });

    return 'installing';
  } catch {
    await openReleasePage(update);
    return 'fallback';
  }
}

import { openReleasePage, type AvailableUpdate } from './checkForUpdate';
import type { UpdateDownloadProgress, UpdateInstallResult } from './installUpdate';

/**
 * The update on the web: there is no Android package installer.
 *
 * The browser opens the page of the release instead. The signature is the
 * same as the native file, so the banner does not branch on the platform.
 */
export async function installUpdate(
  update: AvailableUpdate,
  onProgress?: (progress: UpdateDownloadProgress) => void,
): Promise<UpdateInstallResult> {
  void onProgress;
  await openReleasePage(update);
  return 'fallback';
}

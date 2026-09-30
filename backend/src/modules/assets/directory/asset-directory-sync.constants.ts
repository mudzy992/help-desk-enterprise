/** Paket 3.2 (§12): AD computer sync. */
export const assetDirectorySyncQueueName = 'asset-directory-sync';
export const assetDirectorySyncJobName = 'asset-directory-sync-tick';
export const assetDirectorySyncSchedulerId = 'asset-directory-sync-hourly';
/**
 * Hourly tick; the service runs only when the sync is enabled and
 * `private.assets.directorySync.intervalHours` passed since the last applied run.
 */
export const assetDirectorySyncCronPattern = '23 * * * *';
export const assetDirectorySyncJobAttempts = 1;

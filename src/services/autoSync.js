import { syncNow } from './syncService';

// Silent-Sync-Status für ein dezentes Status-Icon im Verwaltungsmodus
// (SyncScreen) - beeinflusst nie den eigentlichen Auto-Sync-Ablauf selbst.
let status = 'idle'; // 'idle' | 'syncing' | 'synced' | 'error'
let lastError = null;
const listeners = new Set();

function setStatus(nextStatus, nextError = null) {
  status = nextStatus;
  lastError = nextError;
  listeners.forEach((listener) => listener({ status, lastError }));
}

export function getAutoSyncStatus() {
  return { status, lastError };
}

export function subscribeAutoSyncStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const DEBOUNCE_MS = 1500;
let debounceTimer = null;

function runSilentSync() {
  setStatus('syncing');
  syncNow()
    .then((result) => {
      setStatus('synced');
      return result;
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.warn('[Auto-Sync] Silent sync failed:', error?.message || error);
      setStatus('error', error?.message || String(error));
    });
}

/**
 * Silent Fire-and-Forget-Sync nach lokalen Mutationen (Create/Update/
 * Delete). Läuft komplett im Hintergrund: wird NIE awaited vom Aufrufer,
 * zeigt NIE ein Popup/Toast/Fehler in der UI und blockiert die UI nie -
 * Fehler (z.B. offline) landen nur in console.warn und im Status für das
 * dezente Icon im Verwaltungsmodus (siehe getAutoSyncStatus). Schnell
 * aufeinanderfolgende Aufrufe (z.B. Transpose-/Fontsize-Taps) werden
 * debounced, damit nicht bei jedem Tap ein voller Table-Sync losläuft.
 */
export function triggerAutoSync() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runSilentSync();
  }, DEBOUNCE_MS);
}

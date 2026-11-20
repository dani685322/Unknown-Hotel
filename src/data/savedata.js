const SAVE_KEY = 'unknown-hotel.save-data';

export function loadSaveData() {
  try {
    const value = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

export function saveAccountData(account) {
  if (!account) return;
  const current = loadSaveData();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      ...current,
      account: String(account).trim(),
      savedAt: Date.now(),
    }));
  } catch {
    // Storage may be unavailable or full; keep the current session usable.
  }
}

export function saveRunData(runData) {
  const current = loadSaveData();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      ...current,
      run: runData && typeof runData === 'object' ? runData : null,
      savedAt: Date.now(),
    }));
  } catch {
    // Storage may be unavailable or full; the in-memory run can continue.
  }
}

export function clearRunData() {
  const current = loadSaveData();
  delete current.run;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(current));
  } catch {
    // Clearing a saved run must not prevent returning to the title screen.
  }
}

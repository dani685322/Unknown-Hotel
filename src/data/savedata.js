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
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    ...current,
    account: String(account).trim(),
    savedAt: Date.now(),
  }));
}

export function saveRunData(runData) {
  const current = loadSaveData();
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    ...current,
    run: runData && typeof runData === 'object' ? runData : null,
    savedAt: Date.now(),
  }));
}

export function clearRunData() {
  const current = loadSaveData();
  delete current.run;
  localStorage.setItem(SAVE_KEY, JSON.stringify(current));
}

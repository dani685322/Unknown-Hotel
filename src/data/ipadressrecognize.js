export function recognizeSavedAccount() {
  try {
    const value = JSON.parse(localStorage.getItem('unknown-hotel.ip-recognition') ?? '{}');
    return typeof value?.account === 'string' ? value.account : null;
  } catch {
    return null;
  }
}

export function rememberAccountForDevice(account) {
  if (!account) return;
  try {
    localStorage.setItem('unknown-hotel.ip-recognition', JSON.stringify({
      account: String(account).trim(),
      recognizedAt: Date.now(),
    }));
  } catch {
    // Device recognition is optional when browser storage is blocked.
  }
}

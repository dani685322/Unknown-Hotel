const ACCOUNT_KEY = 'unknown-hotel.playerspassword.txt';

export class MultiplayerMenu {
  constructor({ onClose }) {
    this.onClose = onClose;
    this.root = document.createElement('section');
    this.root.className = 'multiplayer-screen';
    this.root.hidden = true;
    document.body.append(this.root);
    this.account = null;
    this.channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('unknown-hotel-beta') : null;
    this.players = new Map();
    this.renderAuth();
  }

  open() {
    this.root.hidden = false;
  }

  close() {
    this.root.hidden = true;
    this.onClose?.();
  }

  readAccounts() {
    try {
      const value = JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  writeAccounts(accounts) {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
  }

  async hashPassword(password, salt) {
    const bytes = new TextEncoder().encode(`${salt}:${password}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  randomSalt() {
    return [...crypto.getRandomValues(new Uint8Array(16))]
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  renderAuth(message = '') {
    this.root.innerHTML = `
      <div class="multiplayer-panel">
        <p class="multiplayer-eyebrow">BETA / LOCAL LOBBY</p>
        <h2>Hotel Network</h2>
        <form class="multiplayer-auth">
          <label>Username<input name="username" maxlength="24" autocomplete="username" required></label>
          <label>Password<input name="password" type="password" minlength="6" maxlength="64" autocomplete="current-password" required></label>
          <div class="multiplayer-actions">
            <button type="submit" name="mode" value="login">Sign in</button>
            <button type="submit" name="mode" value="register" class="secondary">Create account</button>
          </div>
        </form>
        <p class="multiplayer-message">${message}</p>
        <button class="multiplayer-close" type="button">Back</button>
      </div>`;
    this.root.querySelector('.multiplayer-close').addEventListener('click', () => this.close());
    this.root.querySelector('.multiplayer-auth').addEventListener('submit', (event) => this.submitAuth(event));
  }

  async submitAuth(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const username = String(new FormData(form).get('username')).trim();
    const password = String(new FormData(form).get('password'));
    const mode = event.submitter?.value;
    if (!username || password.length < 6) {
      this.renderAuth('Username and a password of at least 6 characters are required.');
      return;
    }
    const accounts = this.readAccounts();
    const existing = accounts.find((account) => account.username.toLowerCase() === username.toLowerCase());

    if (mode === 'register') {
      if (existing) {
        this.renderAuth('That username is already registered on this device.');
        return;
      }
      const salt = this.randomSalt();
      accounts.push({ username, salt, passwordHash: await this.hashPassword(password, salt) });
      this.writeAccounts(accounts);
      this.account = username;
      this.renderLobby(`Account created for ${username}.`);
      return;
    }

    if (!existing) {
      this.renderAuth('Account not found on this device.');
      return;
    }
    const passwordHash = await this.hashPassword(password, existing.salt);
    if (passwordHash !== existing.passwordHash) {
      this.renderAuth('Incorrect password.');
      return;
    }
    this.account = existing.username;
    this.renderLobby(`Signed in as ${existing.username}.`);
  }

  renderLobby(message = '') {
    this.root.innerHTML = `
      <div class="multiplayer-panel">
        <p class="multiplayer-eyebrow">BETA / LOCAL LOBBY</p>
        <h2>${this.account}</h2>
        <div class="multiplayer-status"><b>Lobby status</b><span id="beta-status">Waiting for nearby beta tabs</span></div>
        <div class="multiplayer-player-list" id="beta-player-list"></div>
        <p class="multiplayer-message">${message}</p>
        <div class="multiplayer-actions">
          <button type="button" id="beta-download">Download account file</button>
          <button type="button" id="beta-close" class="secondary">Back</button>
        </div>
      </div>`;
    this.root.querySelector('#beta-close').addEventListener('click', () => this.close());
    this.root.querySelector('#beta-download').addEventListener('click', () => this.downloadAccounts());
    this.startLobby();
  }

  startLobby() {
    if (!this.channel) return;
    this.channel.onmessage = ({ data }) => {
      if (!data?.username) return;
      if (data.type === 'presence') this.players.set(data.username, Date.now());
      if (data.type === 'leave') this.players.delete(data.username);
      this.updatePlayerList();
    };
    this.channel.postMessage({ type: 'presence', username: this.account });
    this.presenceTimer = window.setInterval(() => {
      this.channel?.postMessage({ type: 'presence', username: this.account });
      for (const [name, seen] of this.players) if (Date.now() - seen > 5000) this.players.delete(name);
      this.updatePlayerList();
    }, 2000);
  }

  updatePlayerList() {
    const list = this.root.querySelector('#beta-player-list');
    if (!list) return;
    const names = [this.account, ...this.players.keys()].filter((name, index, values) => values.indexOf(name) === index);
    list.innerHTML = names.map((name) => `<div><span></span>${name}</div>`).join('');
  }

  downloadAccounts() {
    const blob = new Blob([JSON.stringify(this.readAccounts(), null, 2)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'playerspassword.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  close() {
    if (this.presenceTimer) window.clearInterval(this.presenceTimer);
    this.channel?.postMessage({ type: 'leave', username: this.account });
    this.root.hidden = true;
    this.onClose?.();
  }
}

export default MultiplayerMenu;

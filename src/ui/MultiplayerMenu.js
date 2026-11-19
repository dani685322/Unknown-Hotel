import { WebSocketClient } from '../net/WebSocketClient.js';

const ACCOUNT_KEY = 'unknown-hotel.playerspassword.txt';
const SERVER_KEY = 'unknown-hotel.websocket-url';

export class MultiplayerMenu {
  constructor({ onClose, onSession, onChat }) {
    this.onClose = onClose;
    this.onSession = onSession;
    this.onChat = onChat;
    this.root = document.createElement('section');
    this.root.className = 'multiplayer-screen';
    this.root.hidden = true;
    document.body.append(this.root);
    this.account = null;
    this.ws = null;
    this.players = [];
    this.session = null;
    this.party = null;
    this.publicParties = [];
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

  renderAuth(message = '', mode = 'login') {
    this.root.innerHTML = `
      <div class="multiplayer-panel">
        <p class="multiplayer-eyebrow">BETA / LOCAL LOBBY</p>
        <h2>Hotel Network</h2>
        <div class="multiplayer-tabs">
          <button type="button" data-auth-mode="login" class="${mode === 'login' ? 'active' : ''}">Login</button>
          <button type="button" data-auth-mode="register" class="${mode === 'register' ? 'active' : ''}">Sign Up</button>
        </div>
        <form class="multiplayer-auth">
          <label>Server<input name="server" value="${this.getApiUrl()}" placeholder="http://localhost:8080" required></label>
          <label>Username<input name="username" maxlength="24" autocomplete="username" required></label>
          <label>Password<input name="password" type="password" minlength="6" maxlength="64" autocomplete="current-password" required></label>
          <div class="multiplayer-actions">
            <button type="submit" name="mode" value="${mode}">${mode === 'register' ? 'Create account' : 'Login'}</button>
          </div>
        </form>
        <p class="multiplayer-message">${message}</p>
        <button class="multiplayer-close" type="button">Back</button>
      </div>`;
    this.root.querySelector('.multiplayer-close').addEventListener('click', () => this.close());
    this.root.querySelectorAll('[data-auth-mode]').forEach((button) => {
      button.addEventListener('click', () => this.renderAuth('', button.dataset.authMode));
    });
    this.root.querySelector('.multiplayer-auth').addEventListener('submit', (event) => this.submitAuth(event));
  }

  async submitAuth(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const username = String(values.get('username')).trim();
    const password = String(values.get('password'));
    const server = String(values.get('server')).trim().replace(/\/$/, '').replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
    const mode = event.submitter?.value;
    if (!/^https?:\/\//i.test(server)) {
      this.renderAuth('Enter a valid http:// or https:// authentication server URL.');
      return;
    }
    if (!username || password.length < 6) {
      this.renderAuth('Username and a password of at least 6 characters are required.');
      return;
    }
    try {
      const response = await fetch(`${server}/api/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json().catch(() => ({ error: `Server returned HTTP ${response.status}` }));
      if (!response.ok) {
        this.renderAuth(result.error ?? 'Login failed.');
        return;
      }
      this.account = result.username;
      this.session = { token: result.token, role: result.role };
      const socketUrl = server === location.origin
        ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`
        : `${server.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')}/ws`;
      localStorage.setItem(SERVER_KEY, socketUrl);
      this.onSession?.(this.session);
      this.renderLobby(`${mode === 'register' ? 'Account created' : 'Signed in'} as ${result.username}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'network request failed';
      this.renderAuth(`Could not reach the authentication server: ${detail}`);
    }
  }

  renderLobby(message = '') {
    this.root.innerHTML = `
      <div class="multiplayer-panel">
        <p class="multiplayer-eyebrow">BETA / LOCAL LOBBY</p>
        <h2>${this.account}</h2>
        <label class="multiplayer-server">WebSocket server<input id="beta-server" value="${this.getServerUrl()}" placeholder="wss://server.example.com"></label>
        <div class="multiplayer-status"><b>Lobby status</b><span id="beta-status">Disconnected</span></div>
        <div class="party-tools">
          <label>Party name<input id="party-name" maxlength="30" value="${this.account}'s party"></label>
          <label>Visibility<select id="party-visibility"><option value="public">Public</option><option value="private">Private</option></select></label>
          <button type="button" id="party-create">Create Party</button>
          <label>Join by code<input id="party-code" maxlength="6" placeholder="ABC123"></label>
          <button type="button" id="party-join">Join Party</button>
        </div>
        <div class="public-parties" id="public-parties"></div>
        <div class="multiplayer-player-list" id="beta-player-list"></div>
        <p class="multiplayer-message">${message}</p>
        <div class="multiplayer-actions">
          <button type="button" id="beta-connect">Connect</button>
          <button type="button" id="beta-download">Download account file</button>
          <button type="button" id="beta-close" class="secondary">Back</button>
        </div>
      </div>`;
    this.root.querySelector('#beta-close').addEventListener('click', () => this.close());
    this.root.querySelector('#beta-download').addEventListener('click', () => this.downloadAccounts());
    this.root.querySelector('#beta-connect').addEventListener('click', () => this.connectLobby());
    this.root.querySelector('#party-create').addEventListener('click', () => this.createParty());
    this.root.querySelector('#party-join').addEventListener('click', () => this.joinParty());
    this.updatePlayerList();
    this.updatePartyView();
  }

  getServerUrl() {
    const saved = localStorage.getItem(SERVER_KEY);
    if (saved && !saved.includes('-8080.app.github.dev') && !saved.includes(':8080')) return saved;
    return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
  }

  getApiUrl() {
    return location.origin;
  }

  connectLobby() {
    const input = this.root.querySelector('#beta-server');
    const url = input?.value.trim();
    if (!/^wss?:\/\//i.test(url ?? '')) {
      this.setLobbyStatus('Enter a ws:// or wss:// server URL.', 'error');
      return;
    }
    localStorage.setItem(SERVER_KEY, url);
    this.ws?.disconnect();
    this.setLobbyStatus('Connecting...', 'pending');
    this.ws = new WebSocketClient({
      url,
      username: this.account,
      token: this.session?.token,
      onOpen: () => this.setLobbyStatus('Connected', 'ok'),
      onClose: () => this.setLobbyStatus('Disconnected', 'error'),
      onError: (message) => this.setLobbyStatus(message, 'error'),
      onMessage: (message) => this.onChat?.(message),
      onParty: (party) => {
        this.party = party;
        this.updatePartyView();
      },
      onPublicParties: (parties) => {
        this.publicParties = parties;
        this.updatePublicParties();
      },
      onModeration: () => {
        this.party = null;
        this.updatePartyView();
      },
      onPlayers: (players) => {
        this.players = players;
        this.updatePlayerList();
      },
    });
    this.ws.connect();
  }

  createParty() {
    const name = this.root.querySelector('#party-name')?.value;
    const visibility = this.root.querySelector('#party-visibility')?.value;
    if (!this.ws?.socket || this.ws.socket.readyState !== WebSocket.OPEN) {
      this.setLobbyStatus('Connect to the server first.', 'error');
      return;
    }
    this.ws.createParty(name, visibility);
  }

  joinParty() {
    const code = this.root.querySelector('#party-code')?.value.trim();
    if (!code) {
      this.setLobbyStatus('Enter a party code.', 'error');
      return;
    }
    this.ws?.joinParty(code);
  }

  updatePartyView() {
    let view = this.root.querySelector('#party-view');
    if (!view) {
      view = document.createElement('div');
      view.id = 'party-view';
      view.className = 'party-view';
      this.root.querySelector('.multiplayer-panel')?.append(view);
    }
    if (!this.party) {
      view.innerHTML = '';
      return;
    }
    const isLeader = this.party.leader === this.account;
    const humanControls = this.party.members.map((member) => {
      const leaderLabel = member === this.party.leader ? ' / Leader' : '';
      if (!isLeader || member === this.account) return `<span>${member}${leaderLabel}</span>`;
      return `<div class="party-member-row"><b>${member}${leaderLabel}</b><div><button type="button" data-leader="${member}">Lead</button><button type="button" data-kick="${member}">Kick</button><button type="button" data-ban="${member}">Ban</button></div></div>`;
    }).join('');
    const botControls = (this.party.bots ?? []).map((bot) =>
      isLeader ? `<div class="party-member-row bot-member"><b>${bot}</b><button type="button" data-remove-bot="${bot}">Remove</button></div>` : `<span class="bot-member">${bot} / Bot</span>`
    ).join('');
    const addBot = isLeader ? '<button type="button" id="party-add-bot">Add Bot</button>' : '';
    view.innerHTML = `<h3>${this.party.name}</h3><p>Code <b>${this.party.code}</b> · ${this.party.visibility}</p><div class="party-members">${humanControls}${botControls}</div>${addBot}<button type="button" id="party-leave">Leave Party</button>`;
    view.querySelector('#party-leave')?.addEventListener('click', () => this.ws?.leaveParty());
    view.querySelectorAll('[data-leader]').forEach((button) => {
      button.addEventListener('click', () => this.ws?.makeLeader(button.dataset.leader));
    });
    view.querySelectorAll('[data-kick]').forEach((button) => {
      button.addEventListener('click', () => this.ws?.kickMember(button.dataset.kick));
    });
    view.querySelectorAll('[data-ban]').forEach((button) => {
      button.addEventListener('click', () => this.ws?.banMember(button.dataset.ban));
    });
    view.querySelector('#party-add-bot')?.addEventListener('click', () => this.ws?.addBot());
    view.querySelectorAll('[data-remove-bot]').forEach((button) => {
      button.addEventListener('click', () => this.ws?.removeBot(button.dataset.removeBot));
    });
  }

  updatePublicParties() {
    const host = this.root.querySelector('#public-parties');
    if (!host) return;
    host.innerHTML = this.publicParties.length
      ? `<h3>Public Parties</h3>${this.publicParties.map((party) => `<button type="button" data-public-code="${party.code}"><b>${party.name}</b><span>${party.members}/4 · ${party.code}</span></button>`).join('')}`
      : '<p>No public parties.</p>';
    host.querySelectorAll('[data-public-code]').forEach((button) => {
      button.addEventListener('click', () => this.ws?.joinParty(button.dataset.publicCode));
    });
  }

  setLobbyStatus(message, kind) {
    const status = this.root.querySelector('#beta-status');
    if (status) {
      status.textContent = message;
      status.dataset.kind = kind;
    }
  }

  updatePlayerList() {
    const list = this.root.querySelector('#beta-player-list');
    if (!list) return;
    const names = [this.account, ...this.players.map((player) => typeof player === 'string' ? player : player.username).filter(Boolean)].filter((name, index, values) => values.indexOf(name) === index);
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
    this.ws?.disconnect();
    this.root.hidden = true;
    this.onClose?.();
  }
}

export default MultiplayerMenu;

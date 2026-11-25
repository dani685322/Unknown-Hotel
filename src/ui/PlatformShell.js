import { escapeHtml } from '../core/escapeHtml.js';
import './platform.css';

const SESSION_KEY = 'unknown-hotel.platform-session';

export class PlatformShell {
  constructor(root) {
    this.root = root;
    this.session = this.readSession();
    this.games = [];
    this.catalog = [];
    this.view = 'discover';
    this.status = '';
    this.statusKind = '';
    this.editorSlug = null;
    this.autosaveTimer = null;
    this.searchQuery = '';
    this.searchSort = 'popular';
    this.studio = null;
    this.draftAutosaveSavedLocally = true;
    this.render();
    this.refresh();
  }

  readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; }
  }

  saveSession(session) {
    this.session = session;
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
    this.render();
  }

  async request(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers ?? {}) };
    if (this.session?.token) headers.Authorization = `Bearer ${this.session.token}`;
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
    return data;
  }

  async refresh() {
    try {
      const query = new URLSearchParams({ q: this.searchQuery, sort: this.searchSort });
      const [games, catalog] = await Promise.all([this.request(`/api/games?${query}`), this.request('/api/catalog')]);
      this.games = games.games ?? [];
      this.catalog = catalog.cosmetics ?? [];
      if (this.view === 'discover') this.renderView();
      else if (this.view === 'shop') this.renderView();
    } catch (error) {
      this.setStatus(error.message, 'error');
    }
    this.renderFriendsRail();
  }

  setStatus(message, kind = '') {
    this.status = message;
    this.statusKind = kind;
    const node = this.root.querySelector('[data-platform-status]');
    if (node) {
      node.textContent = message;
      node.className = `platform-status ${kind}`;
    }
  }

  setView(view) {
    this.studio?.dispose();
    this.studio = null;
    this.view = view;
    this.status = '';
    this.render();
  }

  creatorDraftKey() {
    return `unknown-hotel.creator-draft.${this.session?.username ?? 'guest'}`;
  }

  loadCreatorDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(this.creatorDraftKey()) ?? 'null');
      return draft && typeof draft === 'object' ? draft : {};
    } catch { return {}; }
  }

  saveCreatorDraft(form) {
    const values = new FormData(form);
    const draft = {
      title: String(values.get('title') ?? '').slice(0, 80),
      slug: String(values.get('slug') ?? '').slice(0, 48),
      description: String(values.get('description') ?? '').slice(0, 500),
      scene: String(values.get('scene') ?? '').slice(0, 200_000),
      multiplayer: values.get('multiplayer') === 'on',
      maxPlayers: Math.min(16, Math.max(1, Number(values.get('maxPlayers')) || 4)),
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(this.creatorDraftKey(), JSON.stringify(draft));
      this.draftAutosaveSavedLocally = true;
    } catch {
      this.draftAutosaveSavedLocally = false;
    }
    return draft;
  }

  scheduleCreatorAutosave(form) {
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(async () => {
      const draft = this.saveCreatorDraft(form);
      if (!this.draftAutosaveSavedLocally) {
        this.setStatus('Autosave unavailable: browser storage could not save this draft.', 'error');
        return;
      }
      if (this.editorSlug && draft.title && draft.slug === this.editorSlug) {
        let scene;
        try {
          scene = JSON.parse(draft.scene);
        } catch {
          this.setStatus('Draft saved on this device. Fix the scene JSON before syncing it to the server.', 'error');
          return;
        }
        try {
          await this.request(`/api/games/${encodeURIComponent(this.editorSlug)}`, { method: 'PATCH', body: JSON.stringify({ title: draft.title, description: draft.description, scene, thumbnail: 'creator' }) });
          this.setStatus('Draft autosaved on this device and the server.', 'ok');
          return;
        } catch (error) {
          this.setStatus(`Draft saved on this device only. Server sync failed: ${error.message}`, 'error');
          return;
        }
      }
      this.setStatus('Draft autosaved on this device.', 'ok');
    }, 650);
  }

  render() {
    this.root.innerHTML = `<div class="platform-app">
      <header class="platform-topbar">
        <button class="platform-brand" data-platform-view="discover" aria-label="Unknown Halls home"><span class="platform-brand-mark">U</span><span>Unknown Halls</span></button>
        <nav class="platform-nav" aria-label="Platform navigation">
          <button data-platform-view="discover" class="${this.view === 'discover' ? 'active' : ''}">Discover</button>
          <button data-platform-view="create" class="${this.view === 'create' ? 'active' : ''}">Create</button>
          <button data-platform-view="friends" class="${this.view === 'friends' ? 'active' : ''}">Friends</button>
          <button data-platform-view="avatar" class="${this.view === 'avatar' ? 'active' : ''}">Avatar</button>
          <button data-platform-view="shop" class="${this.view === 'shop' ? 'active' : ''}">Shop</button>
          ${this.session?.role === 'owner' ? `<button data-platform-view="review" class="${this.view === 'review' ? 'active' : ''}">Review</button>` : ''}
        </nav>
        <button class="platform-account" data-platform-view="${this.session ? 'account' : 'login'}">${this.session ? escapeHtml(this.session.username) : 'Sign in'}</button>
      </header>
      <div class="platform-workspace">
        <main class="platform-wrap" id="platform-content"></main>
        <aside class="platform-friends-rail" aria-label="Friends and activity">
          <div class="platform-rail-heading"><span>Community</span><b>Friends</b></div>
          <div class="platform-friends-list" data-friends-rail></div>
          <button type="button" class="platform-rail-link" data-platform-view="friends">Open friends</button>
        </aside>
      </div>
      <footer class="platform-footer">Original Unknown Halls platform · safe creator scenes · multiplayer beta</footer>
    </div>`;
    this.root.querySelectorAll('[data-platform-view]').forEach((button) => button.addEventListener('click', () => this.setView(button.dataset.platformView)));
    this.renderView();
    this.renderFriendsRail();
  }

  async renderFriendsRail() {
    const rail = this.root.querySelector('[data-friends-rail]');
    if (!rail) return;
    if (!this.session) {
      rail.innerHTML = `<p class="platform-muted">Sign in to see friends and their activity.</p><button class="platform-button secondary" data-platform-view="login">Sign in</button>`;
      rail.querySelector('[data-platform-view]').addEventListener('click', () => this.setView('login'));
      return;
    }
    rail.innerHTML = this.empty('Loading friends…');
    try {
      const data = await this.request('/api/friends');
      if (!rail.isConnected) return;
      const friends = data.friends ?? [];
      rail.innerHTML = friends.length ? friends.map((friend) => `<div class="platform-friend-row">
        <span class="platform-friend-status ${friend.online ? 'online' : ''}" aria-hidden="true"></span>
        <span class="platform-friend-copy"><b>${escapeHtml(friend.username)}</b><small>${friend.online ? `Playing ${escapeHtml(friend.gameSlug ?? 'Unknown Halls')}` : 'Offline'}</small></span>
        ${friend.online && friend.gameSlug ? `<button type="button" data-join-friend="${escapeHtml(friend.gameSlug)}" aria-label="Join ${escapeHtml(friend.username)}">Join</button>` : ''}
      </div>`).join('') : this.empty('Add friends to see when they are playing.');
      rail.querySelectorAll('[data-join-friend]').forEach((button) => button.addEventListener('click', () => this.openGame(button.dataset.joinFriend)));
    } catch (error) {
      if (rail.isConnected) rail.innerHTML = this.empty(error.message);
    }
  }

  renderView() {
    const content = this.root.querySelector('#platform-content');
    if (!content) return;
    if (this.view === 'login') return this.renderAuth(content, 'login');
    if (this.view === 'account') return this.renderAccount(content);
    if (this.view === 'create') return this.renderCreate(content);
    if (this.view === 'friends') return this.renderFriends(content);
    if (this.view === 'avatar') return this.renderInventory(content);
    if (this.view === 'shop') return this.renderShop(content);
    if (this.view === 'review') return this.renderReview(content);
    this.renderDiscover(content);
  }

  renderDiscover(content) {
    const featured = this.games.find((game) => game.slug === 'unknown-halls') ?? {
      slug: 'unknown-halls', title: 'Unknown Halls', creator: 'HuNao', description: 'One hundred doors. No two rooms alike.', visits: 0, version: '1.0.2.4', multiplayer: true,
    };
    content.innerHTML = `<section class="platform-hero">
      <div class="platform-hero-copy"><p class="platform-kicker">Featured multiplayer experience</p><h1>Find your next impossible room.</h1><p>Explore original games made for the Unknown Halls community, starting with one hundred doors and no safe shortcut.</p><div class="platform-actions"><button class="platform-button" data-play="${escapeHtml(featured.slug)}">Play Unknown Halls</button><button class="platform-button secondary" data-platform-view="create">Create a game</button></div></div>
      <div class="platform-hero-art" role="img" aria-label="Unknown Halls brass door plaque"><div class="platform-door-scene"><span>UNKNOWN HALLS</span><b>001</b><small>THE HOTEL</small></div><div class="platform-door-floor"></div></div>
    </section>
    <div class="platform-section-head"><div><h2>Popular experiences</h2><span class="platform-muted">Popularity is based on verified player visits.</span></div><span class="platform-muted">${this.games.length} published game${this.games.length === 1 ? '' : 's'}</span></div>
    <form class="platform-search" data-game-search-form>
      <label><span class="sr-only">Search experiences</span><input name="q" value="${escapeHtml(this.searchQuery)}" maxlength="80" placeholder="Search experiences"></label>
      <label><span class="sr-only">Sort experiences</span><select name="sort"><option value="popular" ${this.searchSort === 'popular' ? 'selected' : ''}>Most visited</option><option value="newest" ${this.searchSort === 'newest' ? 'selected' : ''}>Recently updated</option></select></label>
      <button class="platform-button secondary" type="submit">Search</button>
    </form>
    <section class="platform-grid">${this.games.length ? this.games.map((game) => this.gameCard(game)).join('') : this.empty('Loading published games…')}</section>
    <div data-platform-status class="platform-status ${this.statusKind}">${escapeHtml(this.status)}</div>`;
    content.querySelector('[data-game-search-form]').addEventListener('submit', (event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      this.searchQuery = String(values.get('q') ?? '').trim();
      this.searchSort = values.get('sort') === 'newest' ? 'newest' : 'popular';
      this.refresh();
    });
    content.querySelectorAll('[data-play]').forEach((button) => button.addEventListener('click', () => this.openGame(button.dataset.play)));
    content.querySelectorAll('[data-platform-view]').forEach((button) => button.addEventListener('click', () => this.setView(button.dataset.platformView)));
  }

  gameCard(game) {
    return `<article class="platform-card"><div class="platform-card-art ${game.thumbnail === 'creator' ? 'creator' : ''}"><div class="platform-card-sign"><span>${game.thumbnail === 'creator' ? 'CREATOR' : 'UH'}</span><b>${game.thumbnail === 'creator' ? 'PLAY' : '001'}</b></div>${game.popular ? '<span class="platform-popular">★ 1K visits</span>' : ''}</div><div class="platform-card-body"><h3>${escapeHtml(game.title)}</h3><p class="platform-muted">${escapeHtml(game.description)}</p><div class="platform-card-meta"><span>by ${escapeHtml(game.creator)}</span><strong>${Number(game.visits).toLocaleString()} visits</strong><span>${game.multiplayer ? 'Multiplayer' : 'Solo'}</span></div><div class="platform-card-actions"><button class="platform-button" data-play="${escapeHtml(game.slug)}">Play</button></div></div></article>`;
  }

  renderAuth(content, mode) {
    content.innerHTML = `<form class="platform-form platform-auth" data-auth-form><p class="platform-kicker">Unknown Halls account</p><h1>${mode === 'register' ? 'Create your account' : 'Welcome back'}</h1><label>Username<input name="username" maxlength="24" autocomplete="username" required></label><label>Password<input name="password" type="password" minlength="6" maxlength="64" autocomplete="current-password" required></label><div class="platform-actions"><button class="platform-button" type="submit">${mode === 'register' ? 'Create account' : 'Sign in'}</button><button class="platform-button secondary" type="button" data-auth-switch>${mode === 'register' ? 'I already have an account' : 'Create an account'}</button></div><div data-platform-status class="platform-status ${this.statusKind}">${escapeHtml(this.status)}</div></form>`;
    content.querySelector('[data-auth-switch]').addEventListener('click', () => this.renderAuth(content, mode === 'register' ? 'login' : 'register'));
    content.querySelector('[data-auth-form]').addEventListener('submit', (event) => this.submitAuth(event, mode));
  }

  async submitAuth(event, mode) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      const result = await this.request(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify({ username: values.get('username'), password: values.get('password') }) });
      this.saveSession({ token: result.token, username: result.username, role: result.role });
      this.setView('discover');
    } catch (error) { this.setStatus(error.message, 'error'); }
  }

  renderAccount(content) {
    content.innerHTML = `<section class="platform-auth"><p class="platform-kicker">Signed in</p><h1>${escapeHtml(this.session?.username ?? '')}</h1><p class="platform-muted">Your account can play published games, submit safe creator scenes, chat, and collect original cosmetics.</p><div class="platform-actions"><button class="platform-button secondary" data-signout>Sign out</button><button class="platform-button" data-platform-view="discover">Back to Discover</button></div><div data-platform-status class="platform-status ${this.statusKind}">${escapeHtml(this.status)}</div></section>`;
    content.querySelector('[data-signout]').addEventListener('click', () => { this.saveSession(null); this.setView('discover'); });
    content.querySelector('[data-platform-view]').addEventListener('click', () => this.setView('discover'));
  }

  renderCreate(content) {
    if (!this.session) return this.renderAuth(content, 'login');
    const draft = this.loadCreatorDraft();
    const defaultScene = JSON.stringify({
      template: 'corridor',
      rooms: [{ x: 0, y: 0, z: 0, width: 14, height: 4, depth: 20, material: 'wood' }],
      meshes: [],
      lights: [{ x: 0, y: 3, z: 0, color: '#ffc76b', intensity: 1.2, distance: 18 }],
      spawns: [{ x: 0, y: 0, z: 7 }],
      doors: [],
      triggers: [],
      rules: [],
      blueprint: { version: 1, nodes: [], edges: [] },
      multiplayer: true,
      maxPlayers: 4,
    }, null, 2);
    const sceneValue = typeof draft.scene === 'string' ? draft.scene : defaultScene;
    content.innerHTML = `<section>
      <div class="platform-section-head"><div><p class="platform-kicker">Creator Studio</p><h1>Build a safe playable scene</h1><span class="platform-muted">Build the 3D scene, then scroll below the viewport to edit its Blueprint event graph. Projects are validated data; scripts and executable uploads are not supported.</span></div></div>
      <div class="creator-studio-layout">
        <form class="platform-form" data-create-form>
          <label>Game title<input name="title" maxlength="80" placeholder="My Hallway" value="${escapeHtml(draft.title ?? '')}" required></label>
          <label>Slug<input name="slug" maxlength="48" placeholder="my-hallway" value="${escapeHtml(draft.slug ?? '')}" required></label>
          <label>Description<textarea name="description" maxlength="500" placeholder="Tell players what they will explore.">${escapeHtml(draft.description ?? '')}</textarea></label>
          <div class="studio-game-settings">
            <label class="studio-check"><input name="multiplayer" type="checkbox" ${draft.multiplayer === false ? '' : 'checked'}> Multiplayer scene</label>
            <label>Player limit<select name="maxPlayers">${[1, 2, 4, 8, 16].map((limit) => `<option value="${limit}" ${Number(draft.maxPlayers ?? 4) === limit ? 'selected' : ''}>${limit} players</option>`).join('')}</select></label>
          </div>
          <div data-studio-root></div>
          <details class="studio-json">
            <summary>Advanced scene JSON</summary>
            <label>Validated scene data<textarea name="scene" spellcheck="false">${escapeHtml(sceneValue)}</textarea></label>
          </details>
          <div class="platform-actions"><button class="platform-button" type="submit">Save draft</button><button class="platform-button gold" type="button" data-submit-draft>Save and submit for approval</button></div>
          <div data-platform-status class="platform-status ${this.statusKind}" role="status">${escapeHtml(this.status)}</div>
        </form>
        <aside class="creator-owned-games"><h2>Your projects</h2><p class="platform-muted">Resume a saved draft or check an approval state.</p><div class="platform-list" data-owned-games>${this.empty('Loading your projects…')}</div></aside>
      </div>
    </section>`;
    const form = content.querySelector('[data-create-form]');
    form.addEventListener('input', () => this.scheduleCreatorAutosave(form));
    const sceneField = form.querySelector('[name=scene]');
    sceneField.addEventListener('change', () => {
      try {
        this.studio?.setScene(JSON.parse(sceneField.value));
      } catch {
        this.setStatus('Scene JSON is invalid; correct it before saving to the server.', 'error');
      }
    });
    form.addEventListener('submit', (event) => this.createGame(event, false));
    content.querySelector('[data-submit-draft]').addEventListener('click', () => this.createGame({ currentTarget: form, preventDefault() {} }, true));
    this.loadCreatorGames(content.querySelector('[data-owned-games]'), form);
    import('./SceneStudio.js').then(({ SceneStudio }) => {
      if (!form.isConnected) return;
      try {
        this.studio = new SceneStudio(content.querySelector('[data-studio-root]'), JSON.parse(sceneField.value), (scene) => {
          sceneField.value = JSON.stringify(scene, null, 2);
          this.scheduleCreatorAutosave(form);
        }, (message) => this.setStatus(message, 'error'));
      } catch (error) {
        this.setStatus(`Could not load the scene editor: ${error.message}`, 'error');
      }
    }).catch((error) => this.setStatus(`Could not load the scene editor: ${error.message}`, 'error'));
  }

  async loadCreatorGames(list, form) {
    if (!list) return;
    try {
      const data = await this.request('/api/me/games');
      if (!list.isConnected) return;
      list.innerHTML = data.games.length ? data.games.map((game) => `<div class="platform-list-row">
        <span><b>${escapeHtml(game.title)}</b><small class="platform-muted">${escapeHtml(game.status)} · v${escapeHtml(game.version)}</small></span>
        ${['draft', 'pending', 'rejected'].includes(game.status) ? `<button type="button" class="platform-button secondary" data-edit-game="${escapeHtml(game.slug)}">Edit</button>` : ''}
      </div>`).join('') : this.empty('No projects yet.');
      list.querySelectorAll('[data-edit-game]').forEach((button) => button.addEventListener('click', () => this.loadCreatorGame(button.dataset.editGame, form)));
      const localDraft = this.loadCreatorDraft();
      const savedGame = data.games.find((game) => game.slug === localDraft.slug && ['draft', 'pending', 'rejected'].includes(game.status));
      if (savedGame && Number(localDraft.savedAt) > Number(savedGame.updatedAt)) {
        this.editorSlug = savedGame.slug;
        form.elements.title.value = localDraft.title ?? savedGame.title;
        form.elements.slug.value = savedGame.slug;
        form.elements.slug.readOnly = true;
        form.elements.description.value = localDraft.description ?? savedGame.description;
        form.elements.scene.value = localDraft.scene ?? JSON.stringify({ template: 'corridor' });
        form.elements.multiplayer.checked = localDraft.multiplayer !== false;
        form.elements.maxPlayers.value = String(localDraft.maxPlayers ?? 4);
        this.studio?.setScene(JSON.parse(form.elements.scene.value));
        this.setStatus('Restored unsynced local edits. Saving will sync this project to the server.', 'ok');
      }
    } catch (error) {
      if (list.isConnected) list.innerHTML = this.empty(error.message);
    }
  }

  async loadCreatorGame(slug, form) {
    try {
      const data = await this.request(`/api/me/games/${encodeURIComponent(slug)}`);
      const game = data.game;
      this.editorSlug = game.slug;
      form.elements.title.value = game.title;
      form.elements.slug.value = game.slug;
      form.elements.slug.readOnly = true;
      form.elements.description.value = game.description;
      form.elements.scene.value = JSON.stringify(game.scene, null, 2);
      form.elements.multiplayer.checked = game.scene.multiplayer !== false;
      form.elements.maxPlayers.value = String(game.scene.maxPlayers ?? 4);
      this.studio?.setScene(game.scene);
      this.setStatus(game.rejectionReason ? `Owner feedback: ${game.rejectionReason}` : `Editing ${game.title}.`, game.rejectionReason ? 'error' : 'ok');
    } catch (error) {
      this.setStatus(error.message, 'error');
    }
  }

  async createGame(event, submit) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const form = event.currentTarget;
    clearTimeout(this.autosaveTimer);
    this.saveCreatorDraft(form);
    const slug = String(values.get('slug') ?? '').trim().toLowerCase();
    if (this.editorSlug && slug !== this.editorSlug) {
      this.setStatus('A saved project slug cannot be changed. Create a new project to use another slug.', 'error');
      return;
    }
    let scene;
    try { scene = JSON.parse(String(values.get('scene'))); } catch { this.setStatus('Scene JSON is invalid.', 'error'); return; }
    scene.multiplayer = values.get('multiplayer') === 'on';
    scene.maxPlayers = Math.min(16, Math.max(1, Number(values.get('maxPlayers')) || 4));
    try {
      const path = this.editorSlug ? `/api/games/${encodeURIComponent(this.editorSlug)}` : '/api/games';
      const method = this.editorSlug ? 'PATCH' : 'POST';
      const result = await this.request(path, { method, body: JSON.stringify({ title: values.get('title'), slug, description: values.get('description'), scene, thumbnail: 'creator' }) });
      this.editorSlug = result.game.slug;
      if (submit) await this.request(`/api/games/${encodeURIComponent(result.game.slug)}/submit`, { method: 'POST' });
      this.setStatus(submit ? 'Draft submitted for owner approval.' : 'Draft saved.', 'ok');
      if (submit) {
        try { localStorage.removeItem(this.creatorDraftKey()); } catch { /* optional */ }
        this.editorSlug = null;
        form.elements.slug.readOnly = false;
      }
      this.loadCreatorGames(this.root.querySelector('[data-owned-games]'), form);
    } catch (error) { this.setStatus(error.message, 'error'); }
  }

  renderFriends(content) {
    if (!this.session) return this.renderAuth(content, 'login');
    content.innerHTML = `<section><p class="platform-kicker">Social</p><h1>Friends</h1><form class="platform-form" data-friend-form><label>Send a request<input name="username" maxlength="24" placeholder="Player name" required></label><button class="platform-button" type="submit">Send request</button><div data-platform-status class="platform-status ${this.statusKind}">${escapeHtml(this.status)}</div></form>
      <div class="platform-section-head"><h2>Your connections</h2></div><div class="platform-list" data-friend-list>${this.empty('Loading friends…')}</div>
      <div class="platform-section-head"><h2>Blocked players</h2></div><div class="platform-list" data-block-list>${this.empty('Loading blocked players…')}</div>
    </section>`;
    content.querySelector('[data-friend-form]').addEventListener('submit', (event) => this.sendFriendRequest(event));
    this.loadFriends(content);
  }

  async sendFriendRequest(event) {
    event.preventDefault();
    try { await this.request('/api/friends/request', { method: 'POST', body: JSON.stringify({ username: new FormData(event.currentTarget).get('username') }) }); this.setStatus('Friend request sent.', 'ok'); } catch (error) { this.setStatus(error.message, 'error'); }
  }

  async loadFriends(content) {
    const list = content.querySelector('[data-friend-list]');
    const blockList = content.querySelector('[data-block-list]');
    try {
      const [data, blocks] = await Promise.all([this.request('/api/friends'), this.request('/api/chat/blocks')]);
      if (!content.isConnected) return;
      list.innerHTML = [...(data.friends ?? []).map((friend) => `<div class="platform-list-row"><span><span class="platform-friend-status ${friend.online ? 'online' : ''}"></span> ${escapeHtml(friend.username)} <small class="platform-muted">${friend.online ? `Playing ${escapeHtml(friend.gameSlug ?? 'Unknown Halls')}` : 'Offline'}</small></span>${friend.online && friend.gameSlug ? `<button class="platform-button secondary" data-join-friend="${escapeHtml(friend.gameSlug)}">Join</button>` : '<span class="platform-muted">Friend</span>'}</div>`), ...(data.requests ?? []).map((request) => `<div class="platform-list-row"><span>${escapeHtml(request.username)} <small class="platform-muted">(${request.direction})</small></span>${request.direction === 'incoming' ? `<div class="platform-actions"><button class="platform-button" data-accept-friend="${escapeHtml(request.username)}">Accept</button><button class="platform-button secondary" data-decline-friend="${escapeHtml(request.username)}">Decline</button></div>` : '<span class="platform-muted">Request sent</span>'}</div>`)].join('') || this.empty('No friends or pending requests yet.');
      list.querySelectorAll('[data-accept-friend], [data-decline-friend]').forEach((button) => button.addEventListener('click', async () => {
        const action = button.hasAttribute('data-accept-friend') ? 'accept' : 'decline';
        const username = button.dataset.acceptFriend ?? button.dataset.declineFriend;
        try {
          await this.request(`/api/friends/${encodeURIComponent(username)}/${action}`, { method: 'POST' });
          this.renderFriends(content);
        } catch (error) { this.setStatus(error.message, 'error'); }
      }));
      list.querySelectorAll('[data-join-friend]').forEach((button) => button.addEventListener('click', () => this.openGame(button.dataset.joinFriend)));
      blockList.innerHTML = blocks.blocks.length ? blocks.blocks.map((block) => `<div class="platform-list-row"><span>${escapeHtml(block.username)}</span><button type="button" class="platform-button secondary" data-unblock="${escapeHtml(block.username)}">Unblock</button></div>`).join('') : this.empty('No blocked players.');
      blockList.querySelectorAll('[data-unblock]').forEach((button) => button.addEventListener('click', async () => {
        try {
          await this.request('/api/chat/unblock', { method: 'POST', body: JSON.stringify({ username: button.dataset.unblock }) });
          this.renderFriends(content);
        } catch (error) { this.setStatus(error.message, 'error'); }
      }));
    } catch (error) {
      if (content.isConnected) {
        list.innerHTML = this.empty(error.message);
        blockList.innerHTML = this.empty(error.message);
      }
    }
  }

  renderShop(content) {
    const wishlist = this.readWishlist();
    content.innerHTML = `<section><p class="platform-kicker">Original cosmetics</p><h1>Shop</h1><p class="platform-muted">Earn coins through play and spend them on original community-safe cosmetics.</p>
      <div class="platform-shop-controls"><label>Category<select data-shop-kind><option value="all">All items</option>${[...new Set(this.catalog.map((item) => item.kind))].map((kind) => `<option value="${escapeHtml(kind)}">${escapeHtml(kind)}</option>`).join('')}</select></label><label class="studio-check"><input type="checkbox" data-wishlist-only> Wishlist only</label></div>
      <div class="platform-grid">${this.catalog.map((item) => `<article class="platform-card" data-shop-item data-kind="${escapeHtml(item.kind)}" data-slug="${escapeHtml(item.slug)}"><div class="platform-card-art creator"><div class="platform-card-sign"><span>${escapeHtml(item.kind.toUpperCase())}</span><b>UH</b></div></div><div class="platform-card-body"><h3>${escapeHtml(item.name)}</h3><p class="platform-muted">${escapeHtml(item.description)}</p><div class="platform-card-meta"><strong>${Number(item.price).toLocaleString()} coins</strong><span>${escapeHtml(item.kind)}</span></div><div class="platform-actions"><button class="platform-button secondary" type="button" data-try-on="${escapeHtml(item.slug)}">Preview</button><button class="platform-button" type="button" data-buy="${escapeHtml(item.slug)}">Purchase</button><button class="platform-wishlist ${wishlist.has(item.slug) ? 'active' : ''}" type="button" data-wishlist="${escapeHtml(item.slug)}" aria-pressed="${wishlist.has(item.slug)}" aria-label="Toggle wishlist for ${escapeHtml(item.name)}">♡</button></div></div></article>`).join('')}</div><div data-platform-status class="platform-status ${this.statusKind}">${escapeHtml(this.status)}</div></section>`;
    content.querySelectorAll('[data-buy]').forEach((button) => button.addEventListener('click', () => this.purchase(button.dataset.buy)));
    content.querySelector('[data-shop-kind]').addEventListener('change', () => this.filterShop());
    content.querySelector('[data-wishlist-only]').addEventListener('change', () => this.filterShop());
    content.querySelectorAll('[data-wishlist]').forEach((button) => button.addEventListener('click', () => this.toggleWishlist(button.dataset.wishlist)));
    content.querySelectorAll('[data-try-on]').forEach((button) => button.addEventListener('click', () => {
      sessionStorage.setItem('unknown-hotel.try-on', button.dataset.tryOn);
      this.setView('avatar');
    }));
  }

  readWishlist() {
    try {
      const values = JSON.parse(localStorage.getItem('unknown-hotel.cosmetic-wishlist') ?? '[]');
      return new Set(Array.isArray(values) ? values.filter((value) => typeof value === 'string') : []);
    } catch { return new Set(); }
  }

  toggleWishlist(slug) {
    const wishlist = this.readWishlist();
    if (wishlist.has(slug)) wishlist.delete(slug);
    else wishlist.add(slug);
    try { localStorage.setItem('unknown-hotel.cosmetic-wishlist', JSON.stringify([...wishlist])); } catch { this.setStatus('Wishlist could not be saved on this device.', 'error'); }
    this.renderShop(this.root.querySelector('#platform-content'));
  }

  filterShop() {
    const kind = this.root.querySelector('[data-shop-kind]')?.value ?? 'all';
    const wishlistOnly = this.root.querySelector('[data-wishlist-only]')?.checked ?? false;
    const wishlist = this.readWishlist();
    this.root.querySelectorAll('[data-shop-item]').forEach((card) => {
      card.hidden = (kind !== 'all' && card.dataset.kind !== kind) || (wishlistOnly && !wishlist.has(card.dataset.slug));
    });
  }

  async purchase(slug) {
    if (!this.session) return this.setView('login');
    try {
      const result = await this.request('/api/shop/purchase', { method: 'POST', body: JSON.stringify({ slug }) });
      this.status = `Purchased. Balance: ${result.coins} coins.`;
      this.statusKind = 'ok';
      this.renderShop(this.root.querySelector('#platform-content'));
    } catch (error) { this.setStatus(error.message, 'error'); }
  }

  async renderInventory(content) {
    if (!this.session) return this.renderAuth(content, 'login');
    const tryOn = sessionStorage.getItem('unknown-hotel.try-on');
    content.innerHTML = `<section><p class="platform-kicker">Avatar</p><h1>Your collection</h1><div class="avatar-inventory-layout">
      <div class="avatar-preview-wrap"><p class="platform-kicker">Drag to rotate</p><div class="avatar-preview" data-avatar-preview aria-label="Original geometric avatar preview">
        <div class="avatar-figure"><div class="avatar-head"></div><div class="avatar-body" data-avatar-body data-cosmetic="${escapeHtml(tryOn ?? '')}"></div><div class="avatar-arms"></div><div class="avatar-legs"></div></div>
      </div><p class="platform-muted" data-try-on-label>${tryOn ? `Previewing ${escapeHtml(tryOn)}` : 'Original Unknown Halls avatar'}</p></div>
      <div><div data-platform-status class="platform-status">Loading inventory…</div><div class="platform-list" data-inventory-list></div></div>
    </div></section>`;
    try {
      const data = await this.request('/api/inventory');
      content.querySelector('[data-platform-status]').textContent = `${data.coins} coins available`;
      content.querySelector('[data-inventory-list]').innerHTML = data.items.length ? data.items.map((item) => `<div class="platform-list-row"><span>${escapeHtml(item.name)} <small class="platform-muted">${escapeHtml(item.kind)}</small></span><div class="platform-actions"><button class="platform-button secondary" data-preview-item="${escapeHtml(item.slug)}">Try on</button><button class="platform-button" data-equip="${escapeHtml(item.slug)}">${item.equipped ? 'Equipped' : 'Equip'}</button></div></div>`).join('') : this.empty('Your inventory is empty. Visit the shop to collect cosmetics.');
      content.querySelectorAll('[data-preview-item]').forEach((button) => button.addEventListener('click', () => {
        sessionStorage.setItem('unknown-hotel.try-on', button.dataset.previewItem);
        this.renderInventory(content);
      }));
      content.querySelectorAll('[data-equip]').forEach((button) => button.addEventListener('click', async () => { try { await this.request('/api/shop/equip', { method: 'POST', body: JSON.stringify({ slug: button.dataset.equip }) }); this.renderInventory(content); } catch (error) { this.setStatus(error.message, 'error'); } }));
      this.enableAvatarRotation(content.querySelector('[data-avatar-preview]'));
    } catch (error) { content.querySelector('[data-platform-status]').textContent = error.message; }
  }

  enableAvatarRotation(preview) {
    if (!preview) return;
    let startX = null;
    let rotation = 12;
    preview.addEventListener('pointerdown', (event) => {
      startX = event.clientX;
      preview.setPointerCapture(event.pointerId);
    });
    preview.addEventListener('pointermove', (event) => {
      if (startX === null) return;
      rotation += (event.clientX - startX) * 0.7;
      startX = event.clientX;
      preview.querySelector('.avatar-figure').style.transform = `rotateY(${rotation}deg)`;
    });
    preview.addEventListener('pointerup', () => { startX = null; });
    preview.addEventListener('pointercancel', () => { startX = null; });
  }

  async renderReview(content) {
    if (!content?.isConnected) return;
    if (this.session?.role !== 'owner') return this.renderDiscover(content);
    content.innerHTML = `<section><p class="platform-kicker">Owner moderation</p><h1>Review and safety</h1>
      <div class="platform-section-head"><h2>Game submissions</h2></div>
      <div class="platform-list" data-review-list>${this.empty('Loading submissions…')}</div>
      <div class="platform-section-head"><h2>Chat reports</h2></div>
      <div class="platform-list" data-report-list>${this.empty('Loading reports…')}</div>
      <div class="platform-section-head"><h2>Moderation history</h2></div>
      <div class="platform-list" data-moderation-list>${this.empty('Loading moderation history…')}</div>
    </section>`;
    try {
      const [data, reports, actions] = await Promise.all([
        this.request('/api/admin/games/pending'),
        this.request('/api/admin/chat/reports'),
        this.request('/api/admin/moderation/actions'),
      ]);
      const list = content.querySelector('[data-review-list]');
      list.innerHTML = data.games.length ? data.games.map((game) => `<article class="platform-review-card" data-review-card="${escapeHtml(game.slug)}">
        <div><b>${escapeHtml(game.title)}</b><br><small class="platform-muted">${escapeHtml(game.creator)} · ${escapeHtml(game.description)}</small></div>
        <button type="button" class="platform-button secondary" data-preview="${escapeHtml(game.slug)}">Preview scene</button>
        <pre class="platform-scene-preview" data-scene-preview hidden></pre>
        <label>Moderation note<textarea data-review-note maxlength="300" placeholder="Optional feedback for the creator"></textarea></label>
        <div class="platform-actions"><button class="platform-button" data-approve="${escapeHtml(game.slug)}">Approve</button><button class="platform-button secondary" data-reject="${escapeHtml(game.slug)}">Reject</button></div>
      </article>`).join('') : this.empty('No pending submissions.');
      list.querySelectorAll('[data-approve]').forEach((button) => button.addEventListener('click', () => this.reviewGame(button.dataset.approve, true, button.closest('[data-review-card]').querySelector('[data-review-note]').value)));
      list.querySelectorAll('[data-reject]').forEach((button) => button.addEventListener('click', () => this.reviewGame(button.dataset.reject, false, button.closest('[data-review-card]').querySelector('[data-review-note]').value)));
      list.querySelectorAll('[data-preview]').forEach((button) => button.addEventListener('click', () => this.previewGame(button.dataset.preview, button)));

      const reportList = content.querySelector('[data-report-list]');
      reportList.innerHTML = reports.reports.length ? reports.reports.map((report) => `<article class="platform-review-card" data-report-card="${report.id}">
        <b>${escapeHtml(report.messageAuthor ?? 'Unknown player')} · ${escapeHtml(report.scope ?? 'chat')}</b>
        <p>${escapeHtml(report.messageText ?? 'Message unavailable')}</p>
        <small class="platform-muted">Reported by ${escapeHtml(report.reporter)}: ${escapeHtml(report.reason)}</small>
        <label>Moderator note<textarea data-report-note maxlength="300" placeholder="Optional moderation note"></textarea></label>
        <div class="platform-actions"><button type="button" class="platform-button" data-report-decision="warn">Warn</button><button type="button" class="platform-button secondary" data-report-decision="dismiss">Dismiss</button></div>
      </article>`).join('') : this.empty('No chat reports.');
      reportList.querySelectorAll('[data-report-decision]').forEach((button) => button.addEventListener('click', () => {
        const card = button.closest('[data-report-card]');
        this.reviewChatReport(card.dataset.reportCard, button.dataset.reportDecision, card.querySelector('[data-report-note]').value);
      }));

      const moderationList = content.querySelector('[data-moderation-list]');
      moderationList.innerHTML = actions.actions.length ? actions.actions.map((action) => `<div class="platform-list-row"><span><b>${escapeHtml(action.action)}</b><small class="platform-muted">${escapeHtml(action.target)}${action.gameSlug ? ` · ${escapeHtml(action.gameSlug)}` : ''} · ${escapeHtml(action.note)}</small></span><small>${escapeHtml(new Date(action.createdAt).toLocaleString())}</small></div>`).join('') : this.empty('No moderation actions yet.');
    } catch (error) {
      content.querySelectorAll('[data-review-list], [data-report-list], [data-moderation-list]').forEach((list) => { list.innerHTML = this.empty(error.message); });
    }
  }

  async previewGame(slug, button) {
    try {
      const data = await this.request(`/api/admin/games/${encodeURIComponent(slug)}/preview`);
      const preview = button.closest('[data-review-card]').querySelector('[data-scene-preview]');
      preview.textContent = JSON.stringify(data.game.scene, null, 2);
      preview.hidden = !preview.hidden;
      button.textContent = preview.hidden ? 'Preview scene' : 'Hide preview';
    } catch (error) { this.setStatus(error.message, 'error'); }
  }

  async reviewGame(slug, approve, note) {
    try {
      await this.request(`/api/admin/games/${encodeURIComponent(slug)}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body: JSON.stringify({ note, reason: note || 'Please revise the submitted scene.' }) });
      this.renderReview(this.root.querySelector('#platform-content'));
    } catch (error) { this.setStatus(error.message, 'error'); }
  }

  async reviewChatReport(reportId, decision, note) {
    try {
      await this.request(`/api/admin/chat/reports/${encodeURIComponent(reportId)}/review`, { method: 'POST', body: JSON.stringify({ decision, note }) });
      this.renderReview(this.root.querySelector('#platform-content'));
    } catch (error) { this.setStatus(error.message, 'error'); }
  }

  empty(message) { return `<div class="platform-empty">${escapeHtml(message)}</div>`; }

  async openGame(slug) {
    const gameUrl = new URL(location.href);
    gameUrl.searchParams.set('play', '1');
    gameUrl.searchParams.set('game', slug);
    if (this.launchingGame) return;
    this.launchingGame = true;
    if (this.session?.token) {
      try {
        await this.request(`/api/games/${encodeURIComponent(slug)}/visit`, { method: 'POST' });
      } catch (error) {
        this.setStatus(`Starting game; visit could not be recorded: ${error.message}`, 'error');
      }
    }
    location.assign(gameUrl.href);
  }
}

export default PlatformShell;

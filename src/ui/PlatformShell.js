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
      const [games, catalog] = await Promise.all([this.request('/api/games'), this.request('/api/catalog')]);
      this.games = games.games ?? [];
      this.catalog = catalog.cosmetics ?? [];
      this.renderView();
    } catch (error) {
      this.setStatus(error.message, 'error');
    }
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
    this.view = view;
    this.status = '';
    this.render();
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
      <main class="platform-wrap" id="platform-content"></main>
      <footer class="platform-footer">Original Unknown Halls platform · safe creator scenes · multiplayer beta</footer>
    </div>`;
    this.root.querySelectorAll('[data-platform-view]').forEach((button) => button.addEventListener('click', () => this.setView(button.dataset.platformView)));
    this.renderView();
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
      slug: 'unknown-halls', title: 'Unknown Halls', creator: 'HuNao', description: 'One hundred doors. No two rooms alike.', visits: 0, version: '1.0.2.3', multiplayer: true,
    };
    content.innerHTML = `<section class="platform-hero">
      <div class="platform-hero-copy"><p class="platform-kicker">Featured multiplayer experience</p><h1>Find your next impossible room.</h1><p>Explore original games made for the Unknown Halls community, starting with one hundred doors and no safe shortcut.</p><div class="platform-actions"><button class="platform-button" data-play="${escapeHtml(featured.slug)}">Play Unknown Halls</button><button class="platform-button secondary" data-platform-view="create">Create a game</button></div></div>
      <div class="platform-hero-art" role="img" aria-label="Abstract hotel hallway artwork"></div>
    </section>
    <div class="platform-section-head"><div><h2>Popular experiences</h2><span class="platform-muted">Popularity is based on verified player visits.</span></div><span class="platform-muted">${this.games.length} published game${this.games.length === 1 ? '' : 's'}</span></div>
    <section class="platform-grid">${this.games.length ? this.games.map((game) => this.gameCard(game)).join('') : this.empty('Loading published games…')}</section>
    <div data-platform-status class="platform-status ${this.statusKind}">${escapeHtml(this.status)}</div>`;
    content.querySelectorAll('[data-play]').forEach((button) => button.addEventListener('click', () => this.openGame(button.dataset.play)));
    content.querySelectorAll('[data-platform-view]').forEach((button) => button.addEventListener('click', () => this.setView(button.dataset.platformView)));
  }

  gameCard(game) {
    return `<article class="platform-card"><div class="platform-card-art ${game.thumbnail === 'creator' ? 'creator' : ''}">${game.popular ? '<span class="platform-popular">★ 1K visits</span>' : ''}</div><div class="platform-card-body"><h3>${escapeHtml(game.title)}</h3><p class="platform-muted">${escapeHtml(game.description)}</p><div class="platform-card-meta"><span>by ${escapeHtml(game.creator)}</span><strong>${Number(game.visits).toLocaleString()} visits</strong><span>${game.multiplayer ? 'Multiplayer' : 'Solo'}</span></div><div class="platform-card-actions"><button class="platform-button" data-play="${escapeHtml(game.slug)}">Play</button></div></div></article>`;
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
    content.innerHTML = `<section><div class="platform-section-head"><div><p class="platform-kicker">Creator Studio</p><h1>Build a safe playable scene</h1><span class="platform-muted">Use approved scene data; executable scripts are rejected.</span></div></div><form class="platform-form" data-create-form><label>Game title<input name="title" maxlength="80" placeholder="My Hallway" required></label><label>Slug<input name="slug" maxlength="48" placeholder="my-hallway" required></label><label>Description<textarea name="description" maxlength="500" placeholder="Tell players what they will explore."></textarea></label><label>Scene JSON<textarea name="scene">${escapeHtml(JSON.stringify({ template: 'corridor', rooms: [], meshes: [], lights: [], spawns: [{ x: 0, y: 0, z: 0 }], rules: [] }, null, 2))}</textarea></label><div class="platform-actions"><button class="platform-button" type="submit">Save draft</button><button class="platform-button gold" type="button" data-submit-draft>Save and submit for approval</button></div><div data-platform-status class="platform-status ${this.statusKind}">${escapeHtml(this.status)}</div></form></section>`;
    const form = content.querySelector('[data-create-form]');
    form.addEventListener('submit', (event) => this.createGame(event, false));
    content.querySelector('[data-submit-draft]').addEventListener('click', () => this.createGame({ currentTarget: form, preventDefault() {} }, true));
  }

  async createGame(event, submit) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    let scene;
    try { scene = JSON.parse(String(values.get('scene'))); } catch { this.setStatus('Scene JSON is invalid.', 'error'); return; }
    try {
      const result = await this.request('/api/games', { method: 'POST', body: JSON.stringify({ title: values.get('title'), slug: values.get('slug'), description: values.get('description'), scene, thumbnail: 'creator' }) });
      if (submit) await this.request(`/api/games/${encodeURIComponent(result.game.slug)}/submit`, { method: 'POST' });
      this.setStatus(submit ? 'Draft submitted for owner approval.' : 'Draft saved.', 'ok');
      await this.refresh();
    } catch (error) { this.setStatus(error.message, 'error'); }
  }

  renderFriends(content) {
    if (!this.session) return this.renderAuth(content, 'login');
    content.innerHTML = `<section><p class="platform-kicker">Social</p><h1>Friends</h1><form class="platform-form" data-friend-form><label>Send a request<input name="username" maxlength="24" placeholder="Player name" required></label><button class="platform-button" type="submit">Send request</button><div data-platform-status class="platform-status ${this.statusKind}">${escapeHtml(this.status)}</div></form><div class="platform-section-head"><h2>Your connections</h2></div><div class="platform-list" data-friend-list>${this.empty('Loading friends…')}</div></section>`;
    content.querySelector('[data-friend-form]').addEventListener('submit', (event) => this.sendFriendRequest(event));
    this.loadFriends(content.querySelector('[data-friend-list]'));
  }

  async sendFriendRequest(event) {
    event.preventDefault();
    try { await this.request('/api/friends/request', { method: 'POST', body: JSON.stringify({ username: new FormData(event.currentTarget).get('username') }) }); this.setStatus('Friend request sent.', 'ok'); } catch (error) { this.setStatus(error.message, 'error'); }
  }

  async loadFriends(list) {
    try {
      const data = await this.request('/api/friends');
      list.innerHTML = [...(data.friends ?? []).map((friend) => `<div class="platform-list-row"><span>${escapeHtml(friend.username)}</span><span class="platform-muted">Friend</span></div>`), ...(data.requests ?? []).map((request) => `<div class="platform-list-row"><span>${escapeHtml(request.username)} <small class="platform-muted">(${request.direction})</small></span>${request.direction === 'incoming' ? `<button class="platform-button" data-accept-friend="${escapeHtml(request.username)}">Accept</button>` : ''}</div>`)].join('') || this.empty('No friends or pending requests yet.');
      list.querySelectorAll('[data-accept-friend]').forEach((button) => button.addEventListener('click', async () => { try { await this.request(`/api/friends/${encodeURIComponent(button.dataset.acceptFriend)}/accept`, { method: 'POST' }); this.setView('friends'); } catch (error) { this.setStatus(error.message, 'error'); } }));
    } catch (error) { list.innerHTML = this.empty(error.message); }
  }

  renderShop(content) {
    content.innerHTML = `<section><p class="platform-kicker">Original cosmetics</p><h1>Shop</h1><p class="platform-muted">Earn coins through play and spend them on community-safe cosmetics.</p><div class="platform-grid">${this.catalog.map((item) => `<article class="platform-card"><div class="platform-card-art creator"></div><div class="platform-card-body"><h3>${escapeHtml(item.name)}</h3><p class="platform-muted">${escapeHtml(item.description)}</p><div class="platform-card-meta"><strong>${Number(item.price).toLocaleString()} coins</strong><span>${escapeHtml(item.kind)}</span></div><button class="platform-button" data-buy="${escapeHtml(item.slug)}">Purchase</button></div></article>`).join('')}</div><div data-platform-status class="platform-status ${this.statusKind}">${escapeHtml(this.status)}</div></section>`;
    content.querySelectorAll('[data-buy]').forEach((button) => button.addEventListener('click', () => this.purchase(button.dataset.buy)));
  }

  async purchase(slug) {
    if (!this.session) return this.setView('login');
    try { const result = await this.request('/api/shop/purchase', { method: 'POST', body: JSON.stringify({ slug }) }); this.setStatus(`Purchased. Balance: ${result.coins} coins.`, 'ok'); } catch (error) { this.setStatus(error.message, 'error'); }
  }

  async renderInventory(content) {
    if (!this.session) return this.renderAuth(content, 'login');
    content.innerHTML = `<section><p class="platform-kicker">Avatar</p><h1>Your inventory</h1><div data-platform-status class="platform-status">Loading inventory…</div><div class="platform-list" data-inventory-list></div></section>`;
    try {
      const data = await this.request('/api/inventory');
      content.querySelector('[data-platform-status]').textContent = `${data.coins} coins available`;
      content.querySelector('[data-inventory-list]').innerHTML = data.items.length ? data.items.map((item) => `<div class="platform-list-row"><span>${escapeHtml(item.name)} <small class="platform-muted">${escapeHtml(item.kind)}</small></span><button class="platform-button secondary" data-equip="${escapeHtml(item.slug)}">${item.equipped ? 'Equipped' : 'Equip'}</button></div>`).join('') : this.empty('Your inventory is empty. Visit the shop to collect cosmetics.');
      content.querySelectorAll('[data-equip]').forEach((button) => button.addEventListener('click', async () => { try { await this.request('/api/shop/equip', { method: 'POST', body: JSON.stringify({ slug: button.dataset.equip }) }); this.renderInventory(content); } catch (error) { this.setStatus(error.message, 'error'); } }));
    } catch (error) { content.querySelector('[data-platform-status]').textContent = error.message; }
  }

  async renderReview(content) {
    if (this.session?.role !== 'owner') return this.renderDiscover(content);
    content.innerHTML = `<section><p class="platform-kicker">Owner moderation</p><h1>Approval queue</h1><div class="platform-list" data-review-list>${this.empty('Loading submissions…')}</div></section>`;
    try {
      const data = await this.request('/api/admin/games/pending');
      const list = content.querySelector('[data-review-list]');
      list.innerHTML = data.games.length ? data.games.map((game) => `<div class="platform-list-row"><div><b>${escapeHtml(game.title)}</b><br><small class="platform-muted">${escapeHtml(game.creator)} · ${escapeHtml(game.description)}</small></div><div class="platform-actions"><button class="platform-button" data-approve="${escapeHtml(game.slug)}">Approve</button><button class="platform-button secondary" data-reject="${escapeHtml(game.slug)}">Reject</button></div></div>`).join('') : this.empty('No pending submissions.');
      list.querySelectorAll('[data-approve]').forEach((button) => button.addEventListener('click', () => this.reviewGame(button.dataset.approve, true)));
      list.querySelectorAll('[data-reject]').forEach((button) => button.addEventListener('click', () => this.reviewGame(button.dataset.reject, false)));
    } catch (error) { content.querySelector('[data-review-list]').innerHTML = this.empty(error.message); }
  }

  async reviewGame(slug, approve) {
    try { await this.request(`/api/admin/games/${encodeURIComponent(slug)}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body: JSON.stringify(approve ? {} : { reason: 'Please revise the submitted scene.' }) }); this.renderReview(this.root.querySelector('#platform-content')); } catch (error) { this.setStatus(error.message, 'error'); }
  }

  empty(message) { return `<div class="platform-empty">${escapeHtml(message)}</div>`; }

  async openGame(slug) {
    const gameUrl = new URL(location.href);
    gameUrl.searchParams.set('play', '1');
    gameUrl.searchParams.set('game', slug);
    const popup = window.open('about:blank', '_blank');
    if (!popup) { this.setStatus('Your browser blocked the new tab. Allow popups or use the game link again.', 'error'); return; }
    const safeSrc = gameUrl.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    popup.document.title = 'Unknown Halls';
    popup.document.body.style.cssText = 'margin:0;overflow:hidden;background:#000';
    popup.document.body.innerHTML = `<iframe title="Unknown Halls" src="${safeSrc}" allow="fullscreen; gamepad; microphone" style="width:100vw;height:100vh;border:0;display:block"></iframe>`;
    if (this.session?.token) {
      try { await this.request(`/api/games/${encodeURIComponent(slug)}/visit`, { method: 'POST' }); await this.refresh(); } catch { /* guest play remains available */ }
    }
  }
}

export default PlatformShell;

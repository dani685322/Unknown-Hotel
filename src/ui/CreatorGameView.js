import WebSocketClient from '../net/WebSocketClient.js';

const SESSION_KEY = 'unknown-hotel.platform-session';

export class CreatorGameView {
  constructor(root, slug) {
    this.root = root;
    this.slug = slug;
    this.session = this.readSession();
    this.position = { x: 0, y: 0 };
    this.keys = new Set();
    this.messages = [];
    this.socket = null;
    this.renderLoading();
    this.load();
  }

  readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; }
  }

  async load() {
    try {
      const response = await fetch(`/api/games/${encodeURIComponent(this.slug)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Game is unavailable.');
      this.game = data.game;
      this.render();
      if (this.session?.token) {
        await fetch(`/api/games/${encodeURIComponent(this.slug)}/visit`, { method: 'POST', headers: { Authorization: `Bearer ${this.session.token}` } });
        this.connectChat();
      }
    } catch (error) { this.renderError(error.message); }
  }

  renderLoading() {
    this.root.innerHTML = '<div class="creator-runtime"><div class="creator-panel"><p>Loading approved scene…</p></div></div>';
    this.injectStyles();
  }

  renderError(message) {
    this.root.innerHTML = `<div class="creator-runtime"><div class="creator-panel"><h1>Game unavailable</h1><p>${this.escape(message)}</p><button data-back>Back to Discover</button></div></div>`;
    this.root.querySelector('[data-back]').addEventListener('click', () => { location.href = location.pathname; });
  }

  render() {
    this.root.innerHTML = `<div class="creator-runtime"><canvas data-scene-canvas></canvas><div class="creator-runtime-top"><div><b>${this.escape(this.game.title)}</b><span>by ${this.escape(this.game.creator)}</span></div><button data-back>Exit</button></div><div class="creator-runtime-help">WASD / arrows to move · T to chat</div><div class="creator-chat" hidden><div data-chat-log></div><form data-chat-form><input maxlength="240" placeholder="Message the room…" autocomplete="off"></form></div></div>`;
    this.canvas = this.root.querySelector('[data-scene-canvas]');
    this.context = this.canvas.getContext('2d');
    this.chat = this.root.querySelector('.creator-chat');
    this.chatLog = this.root.querySelector('[data-chat-log]');
    this.root.querySelector('[data-back]').addEventListener('click', () => { location.href = location.pathname; });
    this.root.querySelector('[data-chat-form]').addEventListener('submit', (event) => { event.preventDefault(); const input = event.currentTarget.querySelector('input'); if (input.value.trim()) this.socket?.sendChat(input.value.trim()); input.value = ''; this.chat.hidden = true; });
    window.addEventListener('keydown', this.onKeyDown = (event) => { if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return; if (event.code === 'KeyT') { this.chat.hidden = false; this.chat.querySelector('input').focus(); return; } this.keys.add(event.code); });
    window.addEventListener('keyup', this.onKeyUp = (event) => this.keys.delete(event.code));
    window.addEventListener('resize', this.resize = () => this.resizeCanvas());
    this.resizeCanvas();
    this.lastFrame = performance.now();
    requestAnimationFrame((time) => this.frame(time));
  }

  connectChat() {
    const websocketUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    this.socket = new WebSocketClient({ url: websocketUrl, username: this.session.username, token: this.session.token, gameSlug: this.slug, onGameChat: (message) => this.addMessage(message) });
    this.socket.connect();
  }

  addMessage(message) {
    this.messages.push(`${message.username}: ${message.text}`);
    this.messages = this.messages.slice(-8);
    if (this.chatLog) this.chatLog.innerHTML = this.messages.map((text) => `<div>${this.escape(text)}</div>`).join('');
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * scale);
    this.canvas.height = Math.floor(window.innerHeight * scale);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.context?.setTransform(scale, 0, 0, scale, 0, 0);
  }

  frame(time) {
    const dt = Math.min((time - this.lastFrame) / 1000, 0.05);
    this.lastFrame = time;
    const speed = 180 * dt;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.position.y -= speed;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.position.y += speed;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.position.x -= speed;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.position.x += speed;
    this.draw();
    requestAnimationFrame((next) => this.frame(next));
  }

  draw() {
    if (!this.context || !this.game) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ctx = this.context;
    ctx.fillStyle = '#0c111a'; ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.translate(width / 2 - this.position.x, height / 2 - this.position.y);
    const scene = this.game.scene ?? {};
    const rooms = Array.isArray(scene.rooms) && scene.rooms.length ? scene.rooms : [{ x: -420, y: -260, width: 840, height: 520 }];
    rooms.forEach((room, index) => {
      const x = Number(room.x ?? index * 150 - 400); const y = Number(room.y ?? -220); const w = Number(room.width ?? 260); const h = Number(room.height ?? 400);
      ctx.fillStyle = index % 2 ? '#26364a' : '#2e3e51'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#7fa4c7'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
    });
    (Array.isArray(scene.meshes) ? scene.meshes : []).forEach((mesh) => {
      ctx.fillStyle = mesh.color || '#c99557'; ctx.fillRect(Number(mesh.x ?? 0), Number(mesh.y ?? 0), Number(mesh.width ?? 40), Number(mesh.height ?? 40));
    });
    ctx.fillStyle = '#f4c55d'; ctx.beginPath(); ctx.arc(this.position.x, this.position.y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  injectStyles() {
    if (document.getElementById('creator-runtime-style')) return;
    const style = document.createElement('style'); style.id = 'creator-runtime-style'; style.textContent = `.creator-runtime{position:fixed;z-index:1000;inset:0;overflow:hidden;background:#0c111a;color:#f4f6fb;font:14px system-ui,sans-serif}.creator-runtime canvas{display:block}.creator-runtime-top{position:fixed;left:18px;right:18px;top:18px;display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(11,13,18,.82);backdrop-filter:blur(10px)}.creator-runtime-top div{display:grid;gap:2px}.creator-runtime-top span{color:#aab2c2;font-size:12px}.creator-runtime-top button,.creator-panel button{padding:8px 14px;border:1px solid #4d8dff;border-radius:7px;background:#16284d;color:#fff;cursor:pointer}.creator-runtime-help{position:fixed;left:18px;bottom:18px;padding:8px 11px;border-radius:7px;background:rgba(11,13,18,.78);color:#aab2c2;font-size:12px}.creator-chat{position:fixed;left:18px;bottom:58px;width:min(360px,calc(100vw - 36px));padding:10px;border:1px solid rgba(255,255,255,.16);border-radius:9px;background:rgba(11,13,18,.92)}.creator-chat div{display:grid;gap:4px;max-height:160px;overflow:auto;margin-bottom:8px;color:#d9e2f2;font-size:12px}.creator-chat input{width:100%;box-sizing:border-box;padding:9px;border:1px solid rgba(255,255,255,.16);background:#0c111a;color:#fff}.creator-panel{display:grid;gap:12px;place-items:center;align-content:center;height:100% ;text-align:center}`; document.head.append(style);
  }

  escape(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
}

export default CreatorGameView;

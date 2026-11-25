import * as THREE from 'three';
import { runBlueprintEvent } from '../core/BlueprintGraph.js';
import WebSocketClient from '../net/WebSocketClient.js';

const SESSION_KEY = 'unknown-hotel.platform-session';
const MATERIAL_COLORS = {
  wood: '#73543a',
  stone: '#7d858b',
  brass: '#c7963f',
  fabric: '#526b73',
  glass: '#7fb5c8',
  concrete: '#92908a',
};

export class CreatorGameView {
  constructor(root, slug) {
    this.root = root;
    this.slug = slug;
    this.session = this.readSession();
    this.position = new THREE.Vector3(0, 1.65, 6);
    this.keys = new Set();
    this.messages = [];
    this.typingPlayers = new Map();
    this.typingTimers = new Map();
    this.isTyping = false;
    this.lastTypingSentAt = 0;
    this.remotePlayers = new Map();
    this.doors = [];
    this.triggers = [];
    this.sceneLights = [];
    this.socket = null;
    this.running = true;
    this.yaw = 0;
    this.pitch = 0;
    this.lastStateSent = 0;
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
        const visitResponse = await fetch(`/api/games/${encodeURIComponent(this.slug)}/visit`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.session.token}` },
        });
        if (!visitResponse.ok) this.setChatStatus('Visit could not be recorded.');
        await this.loadChatHistory();
        this.connectChat();
      }
    } catch (error) {
      this.renderError(error.message);
    }
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
    this.root.innerHTML = `<div class="creator-runtime"><canvas data-scene-canvas aria-label="Game scene"></canvas>
      <div class="creator-runtime-top"><div><b>${this.escape(this.game.title)}</b><span>by ${this.escape(this.game.creator)}</span><small data-player-count>1 player</small></div><button data-back>Exit</button></div>
      <div class="creator-runtime-help">Click scene to look · WASD / arrows to move · E interact · T to chat</div>
      <div class="creator-runtime-status" data-game-status aria-live="polite"></div>
      <div class="creator-chat-live" data-chat-live aria-live="polite" hidden>
        <div class="creator-chat-feed" data-chat-feed></div>
        <div class="creator-chat-typing" data-chat-typing hidden><span data-typing-label></span><span class="creator-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span></div>
      </div>
      <div class="creator-chat" hidden><div data-chat-log></div><p data-chat-status aria-live="polite"></p><form data-chat-form><input maxlength="240" placeholder="Message the room…" autocomplete="off"></form></div>
    </div>`;
    this.canvas = this.root.querySelector('[data-scene-canvas]');
    this.chat = this.root.querySelector('.creator-chat');
    this.chatLog = this.root.querySelector('[data-chat-log]');
    this.chatFeed = this.root.querySelector('[data-chat-feed]');
    this.chatLive = this.root.querySelector('[data-chat-live]');
    this.chatTyping = this.root.querySelector('[data-chat-typing]');
    this.typingLabel = this.root.querySelector('[data-typing-label]');
    if (!this.session?.token) this.setChatStatus('Sign in to chat with players.');
    this.root.querySelector('[data-back]').addEventListener('click', () => this.exit());
    this.root.querySelector('[data-chat-form]').addEventListener('submit', (event) => {
      event.preventDefault();
      const input = event.currentTarget.querySelector('input');
      const text = input.value.trim();
      this.stopTyping();
      if (text && !this.session?.token) this.setChatStatus('Sign in to chat with players.');
      else if (text && !this.socket?.sendGameChat(text)) this.setChatStatus('Chat connection unavailable. Try again.');
      input.value = '';
      input.blur();
      this.setChatOpen(false);
    });
    this.root.querySelector('[data-chat-form] input').addEventListener('input', (event) => this.updateOwnTyping(event.currentTarget.value));
    this.root.querySelector('[data-chat-form] input').addEventListener('blur', () => this.stopTyping());
    this.chatLog.addEventListener('click', (event) => {
      const button = event.target.closest('[data-chat-action]');
      if (button) this.moderateMessage(button.dataset.messageId, button.dataset.username, button.dataset.chatAction);
    });
    this.canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.();
    });
    window.addEventListener('keydown', this.onKeyDown = (event) => {
      if (event.code === 'Escape' && !this.chat.hidden) {
        this.setChatOpen(false);
        this.chat.querySelector('input').blur();
        this.stopTyping();
        return;
      }
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (event.code === 'KeyT') {
        this.setChatOpen(true);
        this.chat.querySelector('input').focus();
        return;
      }
      if (event.code === 'KeyE' && !event.repeat) this.interact();
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
    });
    window.addEventListener('keyup', this.onKeyUp = (event) => this.keys.delete(event.code));
    document.addEventListener('mousemove', this.onMouseMove = (event) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.yaw -= event.movementX * 0.002;
      this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch - event.movementY * 0.002));
    });
    window.addEventListener('resize', this.resize = () => this.resizeRenderer());
    this.initializeScene();
    this.lastFrame = performance.now();
    requestAnimationFrame((time) => this.frame(time));
  }

  initializeScene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.world = new THREE.Scene();
    this.world.background = new THREE.Color('#111720');
    this.world.fog = new THREE.Fog('#111720', 24, 90);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 120);
    this.world.add(new THREE.HemisphereLight('#cfdeef', '#281f1b', 1.2));
    const keyLight = new THREE.DirectionalLight('#ffe3b5', 1.8);
    keyLight.position.set(6, 12, 8);
    keyLight.castShadow = true;
    this.world.add(keyLight);
    this.worldObjects = new THREE.Group();
    this.world.add(this.worldObjects);
    this.remoteGroup = new THREE.Group();
    this.world.add(this.remoteGroup);
    this.buildWorld(this.game.scene ?? {});
    this.resizeRenderer();
  }

  makeMaterial(name) {
    return new THREE.MeshStandardMaterial({
      color: MATERIAL_COLORS[name] ?? MATERIAL_COLORS.wood,
      roughness: name === 'glass' ? 0.3 : 0.8,
      metalness: name === 'brass' ? 0.6 : 0.04,
    });
  }

  addBox(parent, x, y, z, width, height, depth, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), this.makeMaterial(material));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  buildWorld(scene) {
    const rooms = Array.isArray(scene.rooms) && scene.rooms.length
      ? scene.rooms
      : [{ x: 0, y: 0, z: 0, width: 14, height: 4, depth: 24, material: 'wood' }];
    rooms.forEach((room) => {
      const { x = 0, y = 0, z = 0, width = 14, height = 4, depth = 20, material = 'wood' } = room;
      this.addBox(this.worldObjects, x, y - 0.08, z, width, 0.16, depth, material);
      this.addBox(this.worldObjects, x, y + height / 2, z - depth / 2, width, height, 0.18, material);
      this.addBox(this.worldObjects, x - width / 2, y + height / 2, z, 0.18, height, depth, material);
      this.addBox(this.worldObjects, x + width / 2, y + height / 2, z, 0.18, height, depth, material);
    });
    (scene.meshes ?? []).forEach((mesh) => this.addBox(this.worldObjects, mesh.x, mesh.y + mesh.height / 2, mesh.z, mesh.width, mesh.height, mesh.depth, mesh.material));
    this.doors = (scene.doors ?? []).map((door) => ({
      data: door,
      mesh: this.addBox(this.worldObjects, door.x, door.y + door.height / 2, door.z, door.width, door.height, door.depth, door.material),
    }));
    (scene.triggers ?? []).forEach((trigger) => {
      const marker = this.addBox(this.worldObjects, trigger.x, trigger.y + trigger.height / 2, trigger.z, trigger.width, trigger.height, trigger.depth, 'glass');
      marker.material.transparent = true;
      marker.material.opacity = 0.3;
      this.triggers.push({ data: trigger, marker });
    });
    (scene.spawns ?? []).forEach((spawn) => {
      const marker = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 4), new THREE.MeshStandardMaterial({ color: '#7ee3b0' }));
      marker.position.set(spawn.x, spawn.y + 0.4, spawn.z);
      this.worldObjects.add(marker);
    });
    (scene.lights ?? []).forEach((light) => {
      const point = new THREE.PointLight(light.color ?? '#ffc76b', light.intensity ?? 1, light.distance ?? 12);
      point.position.set(light.x, light.y, light.z);
      this.worldObjects.add(point);
      this.sceneLights.push(point);
    });
    const spawn = scene.spawns?.[0];
    if (spawn) this.position.set(spawn.x, Math.max(1.2, spawn.y + 1.65), spawn.z);
    const flow = this.runBlueprint('enter');
    const entryRule = scene.rules?.find((rule) => rule.event === 'enter');
    if (!flow?.steps && entryRule) this.applyAction(entryRule.action, entryRule.value);
  }

  interact() {
    const flow = this.runBlueprint('interact');
    if (flow?.steps) return;
    const point = new THREE.Vector2(this.position.x, this.position.z);
    const trigger = this.triggers.find(({ data }) => point.distanceTo(new THREE.Vector2(data.x, data.z)) < Math.max(data.width, data.depth) / 2 + 1);
    if (trigger) {
      this.applyAction(trigger.data.action, '');
      return;
    }
    const door = this.doors.find(({ data, mesh }) => mesh.visible && point.distanceTo(new THREE.Vector2(data.x, data.z)) < 3);
    if (door) {
      if (door.data.locked) {
        this.setGameStatus('This door is locked.');
        return;
      }
      door.mesh.visible = false;
      this.setGameStatus('Door opened.');
      return;
    }
    const rule = this.game.scene?.rules?.find((item) => item.event === 'interact');
    if (rule) this.applyAction(rule.action, rule.value);
  }

  applyAction(action, value) {
    if (action === 'open-door') {
      const door = this.doors.find(({ data, mesh }) => mesh.visible && Math.hypot(data.x - this.position.x, data.z - this.position.z) < 6);
      if (door) {
        door.mesh.visible = false;
        this.setGameStatus('Door opened.');
      } else {
        this.setGameStatus('No door is close enough to open.');
      }
    } else if (action === 'show-message') {
      this.setGameStatus(value || 'You found something interesting.');
    } else if (action === 'complete') {
      this.setGameStatus(value || 'Area complete.');
    } else if (action === 'toggle-light') {
      const visible = this.sceneLights.some((light) => light.visible);
      this.sceneLights.forEach((light) => { light.visible = !visible; });
      this.setGameStatus(visible ? 'Lights off.' : 'Lights on.');
    }
  }

  runBlueprint(eventName) {
    const blueprint = this.game.scene?.blueprint;
    if (!blueprint?.nodes?.length) return null;
    return runBlueprintEvent(blueprint, eventName, {
      evaluateCondition: (node) => {
        if (node.type === 'condition-door-locked') {
          return this.doors.find(({ data }) => data.id === node.properties.targetId)?.data.locked === true;
        }
        if (node.type === 'condition-player-near-object') {
          const target = [...this.doors, ...this.triggers].find(({ data }) => data.id === node.properties.targetId)?.data;
          if (!target) return false;
          const radius = Math.max(Number(target.width) || 2, Number(target.depth) || 2) / 2 + 1;
          return Math.hypot((target.x ?? 0) - this.position.x, (target.z ?? 0) - this.position.z) <= radius;
        }
        return false;
      },
      executeAction: (node) => {
        const actions = {
          'action-open-door': 'open-door',
          'action-show-message': 'show-message',
          'action-complete': 'complete',
          'action-toggle-light': 'toggle-light',
        };
        const action = actions[node.type];
        if (action) this.applyAction(action, node.properties.value ?? '');
      },
    });
  }

  setGameStatus(message) {
    const status = this.root.querySelector('[data-game-status]');
    if (status) status.textContent = message;
  }

  setChatOpen(isOpen) {
    this.chat.hidden = !isOpen;
    this.chatLive.style.bottom = isOpen ? `${this.chat.offsetHeight + 70}px` : '';
  }

  resizeRenderer() {
    if (!this.renderer || !this.camera) return;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  connectChat() {
    const websocketUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    this.socket = new WebSocketClient({
      url: websocketUrl,
      username: this.session.username,
      token: this.session.token,
      gameSlug: this.slug,
      onError: (message) => this.setChatStatus(message),
      onJoined: () => this.setChatStatus(''),
      onGameChat: (message) => this.addMessage(message),
      onGameTyping: (message) => this.updateGameTyping(message),
      onGamePlayers: (slug, players) => {
        if (slug === this.slug) this.updateRemotePlayers(players);
      },
      onClose: () => this.clearTypingPlayers(),
    });
    this.socket.connect();
  }

  updateOwnTyping(value) {
    if (!value.trim()) {
      this.stopTyping();
      return;
    }
    const now = Date.now();
    if (this.isTyping && now - this.lastTypingSentAt < 1200) return;
    this.isTyping = true;
    this.lastTypingSentAt = now;
    this.socket?.sendGameTyping(true);
  }

  stopTyping() {
    if (!this.isTyping) return;
    this.isTyping = false;
    this.lastTypingSentAt = 0;
    this.socket?.sendGameTyping(false);
  }

  updateGameTyping(message) {
    if (message.gameSlug !== this.slug || !message.username
      || message.username.toLowerCase() === this.session?.username?.toLowerCase()) return;
    const username = String(message.username);
    clearTimeout(this.typingTimers.get(username));
    this.typingTimers.delete(username);
    if (message.isTyping) {
      this.typingPlayers.set(username, Date.now());
      const timer = setTimeout(() => {
        this.typingPlayers.delete(username);
        this.typingTimers.delete(username);
        this.renderTypingIndicator();
      }, 5000);
      this.typingTimers.set(username, timer);
    } else {
      this.typingPlayers.delete(username);
    }
    this.renderTypingIndicator();
  }

  clearTypingForUser(username) {
    clearTimeout(this.typingTimers.get(username));
    this.typingTimers.delete(username);
    this.typingPlayers.delete(username);
  }

  clearTypingPlayers() {
    this.typingTimers.forEach((timer) => clearTimeout(timer));
    this.typingTimers.clear();
    this.typingPlayers.clear();
    this.renderTypingIndicator();
  }

  renderTypingIndicator() {
    if (!this.chatTyping || !this.chatLive) return;
    const usernames = [...this.typingPlayers.keys()];
    this.chatTyping.hidden = usernames.length === 0;
    if (usernames.length === 1) this.typingLabel.textContent = `${usernames[0]} is typing`;
    else if (usernames.length > 1) this.typingLabel.textContent = 'Several players are typing';
    this.chatLive.hidden = usernames.length === 0 && !this.messages.length;
  }

  async loadChatHistory() {
    try {
      const response = await fetch(`/api/chat/history?game=${encodeURIComponent(this.slug)}&limit=40`, {
        headers: { Authorization: `Bearer ${this.session.token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not load chat history.');
      this.messages = data.messages ?? [];
      this.renderMessages();
      this.renderLiveChat();
    } catch (error) {
      this.setChatStatus(`Chat history unavailable: ${error.message}`);
    }
  }

  updateRemotePlayers(players) {
    const others = players.filter((player) => player.username !== this.session?.username);
    const active = new Set(others.map((player) => player.username));
    for (const [username, avatar] of this.remotePlayers) {
      if (!active.has(username)) {
        this.remoteGroup.remove(avatar);
        avatar.traverse((object) => {
          object.geometry?.dispose();
          object.material?.dispose();
        });
        this.remotePlayers.delete(username);
      }
    }
    others.forEach((player) => {
      let avatar = this.remotePlayers.get(player.username);
      if (!avatar) {
        avatar = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.2, 0.35), new THREE.MeshStandardMaterial({ color: '#78a8c9' }));
        body.position.y = 0.65;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), new THREE.MeshStandardMaterial({ color: '#d6b898' }));
        head.position.y = 1.45;
        avatar.add(body, head);
        this.remoteGroup.add(avatar);
        this.remotePlayers.set(player.username, avatar);
      }
      avatar.position.set(player.x, 0, player.z);
      avatar.rotation.y = player.yaw;
    });
    const count = this.root.querySelector('[data-player-count]');
    if (count) count.textContent = `${players.length} player${players.length === 1 ? '' : 's'} online`;
  }

  frame(time) {
    if (!this.running) return;
    const dt = Math.min((time - this.lastFrame) / 1000, 0.05);
    this.lastFrame = time;
    const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    const side = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    if (forward || side) {
      const length = Math.hypot(forward, side);
      const step = 4.2 * dt / length;
      this.position.x += (Math.cos(this.yaw) * side - Math.sin(this.yaw) * forward) * step;
      this.position.z += (Math.sin(this.yaw) * side - Math.cos(this.yaw) * forward) * step;
      this.position.x = Math.max(-99, Math.min(99, this.position.x));
      this.position.z = Math.max(-99, Math.min(99, this.position.z));
    }
    if (this.camera) {
      this.camera.position.copy(this.position);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.pitch, this.yaw, 0);
    }
    if (this.game.multiplayer && this.socket?.authenticated && time - this.lastStateSent > 100) {
      this.lastStateSent = time;
      this.socket.sendGamePlayerState({ x: this.position.x, y: this.position.y - 1.65, z: this.position.z, yaw: this.yaw });
    }
    this.renderer?.render(this.world, this.camera);
    this.frameHandle = requestAnimationFrame((next) => this.frame(next));
  }

  addMessage(message) {
    this.clearTypingForUser(message.username);
    this.messages.push(message);
    this.messages = this.messages.slice(-40);
    this.renderMessages();
    this.renderLiveChat();
  }

  renderMessages() {
    if (!this.chatLog) return;
    this.chatLog.replaceChildren();
    this.messages.slice(-40).forEach((message) => {
      const row = document.createElement('div');
      row.className = 'creator-chat-message';
      const text = document.createElement('span');
      text.textContent = `${message.username}: ${message.text}`;
      row.append(text);
      if (this.session?.username?.toLowerCase() !== message.username?.toLowerCase() && Number.isInteger(message.messageId)) {
        for (const [action, label] of [['report', 'Report'], ['block', 'Block']]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.dataset.chatAction = action;
          button.dataset.messageId = String(message.messageId);
          button.dataset.username = message.username;
          row.append(button);
        }
      }
      this.chatLog.append(row);
    });
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  renderLiveChat() {
    if (!this.chatFeed || !this.chatLive) return;
    this.chatFeed.replaceChildren();
    this.messages.slice(-4).forEach((message) => {
      const row = document.createElement('div');
      row.className = 'creator-chat-live-message';
      const username = document.createElement('b');
      username.textContent = `${message.username}: `;
      const text = document.createElement('span');
      text.textContent = message.text;
      row.append(username, text);
      this.chatFeed.append(row);
    });
    this.chatLive.hidden = !this.messages.length && this.typingPlayers.size === 0;
  }

  async moderateMessage(messageId, username, action) {
    if (!this.session?.token) return;
    try {
      const response = await fetch(`/api/chat/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.session.token}` },
        body: JSON.stringify(action === 'report' ? { messageId: Number(messageId), reason: 'Inappropriate or harmful chat.' } : { username }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `Could not ${action} this message.`);
      this.setChatStatus(action === 'report' ? 'Message reported to the owner.' : `${username} blocked.`);
      if (action === 'block') {
        this.messages = this.messages.filter((message) => message.username?.toLowerCase() !== username.toLowerCase());
        this.clearTypingForUser(username);
        this.renderLiveChat();
        this.renderTypingIndicator();
      }
      this.renderMessages();
    } catch (error) {
      this.setChatStatus(error.message);
    }
  }

  setChatStatus(message) {
    const status = this.root.querySelector('[data-chat-status]');
    if (status) status.textContent = message;
  }

  exit() {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    this.socket?.disconnect();
    this.renderer?.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('mousemove', this.onMouseMove);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    location.href = location.pathname;
  }

  injectStyles() {
    if (document.getElementById('creator-runtime-style')) return;
    const style = document.createElement('style');
    style.id = 'creator-runtime-style';
    style.textContent = `.creator-runtime{position:fixed;z-index:1000;inset:0;overflow:hidden;background:#111720;color:#f4f6fb;font:14px system-ui,sans-serif}.creator-runtime canvas{display:block;width:100vw;height:100vh}.creator-runtime-top{position:fixed;left:18px;right:18px;top:18px;display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:rgba(17,23,32,.88)}.creator-runtime-top div{display:grid;gap:2px}.creator-runtime-top span,.creator-runtime-top small{color:#c1c9d2;font-size:12px}.creator-runtime-top button,.creator-panel button{padding:8px 14px;border:1px solid #c7963f;border-radius:4px;background:#28231b;color:#fff;cursor:pointer}.creator-runtime-help{position:fixed;left:18px;bottom:18px;padding:8px 11px;border:1px solid rgba(255,255,255,.14);border-radius:4px;background:rgba(17,23,32,.88);color:#c1c9d2;font-size:12px}.creator-runtime-status{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);padding:8px 12px;color:#f0d7a4;background:rgba(17,23,32,.82)}.creator-chat{position:fixed;left:18px;bottom:58px;width:min(420px,calc(100vw - 36px));padding:10px;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:rgba(17,23,32,.96)}.creator-chat [data-chat-log]{display:grid;gap:7px;max-height:260px;overflow:auto;margin-bottom:8px;color:#e4e6e9;font-size:12px}.creator-chat-message{display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:center}.creator-chat-message button{border:0;background:transparent;color:#d9b16a;font-size:10px;cursor:pointer}.creator-chat p{color:#c1c9d2;font-size:11px}.creator-chat input{width:100%;box-sizing:border-box;padding:9px;border:1px solid rgba(255,255,255,.16);background:#0c111a;color:#fff}.creator-chat-live{position:fixed;z-index:1001;left:18px;bottom:64px;display:grid;gap:6px;width:min(420px,calc(100vw - 36px));pointer-events:none}.creator-chat-live[hidden],.creator-chat-typing[hidden]{display:none}.creator-chat-feed{display:grid;gap:4px;max-height:150px;overflow:hidden}.creator-chat-live-message,.creator-chat-typing{width:fit-content;max-width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(17,23,32,.88);color:#f4f6fb;font-size:12px;line-height:1.4;overflow-wrap:anywhere}.creator-chat-live-message b{color:#e2c17e}.creator-chat-typing{display:flex;align-items:center;gap:8px;color:#c1c9d2}.creator-typing-dots{display:inline-flex;align-items:center;gap:3px}.creator-typing-dots i{width:5px;height:5px;border-radius:50%;background:#e2c17e;animation:creator-typing-bounce .8s infinite ease-in-out}.creator-typing-dots i:nth-child(2){animation-delay:.12s}.creator-typing-dots i:nth-child(3){animation-delay:.24s}@keyframes creator-typing-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}.creator-panel{display:grid;gap:12px;place-items:center;align-content:center;height:100%}`;
    document.head.append(style);
  }

  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }
}

export default CreatorGameView;

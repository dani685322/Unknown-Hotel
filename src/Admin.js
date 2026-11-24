import { CHAT_ROLES, isAdminUsername } from '../Secret Folder/UsernameAdmin.js';

const HISTORY_KEY = 'unknown-hotel-admin-history';
const MAX_HISTORY = 50;
const MAX_OUTPUT = 500;
const BLOCKED_PATHS = new Set(['__proto__', 'prototype', 'constructor']);

export class Admin {
  constructor({ game, scene, player, entities, enabled = true }) {
    this.game = game;
    this.scene = scene;
    this.player = player;
    this.entities = entities;
    this.enabled = enabled;
    this.commands = {};
    this.history = this._readHistory();
    this.historyIndex = this.history.length;
    this.opened = false;

    this.root = document.createElement('section');
    this.root.id = game.isLegacyGame ? 'admin-panel' : 'admin-terminal';
    this.root.className = 'admin';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Developer console');
    this.root.innerHTML = '<header class="admin__header"><span>HOTEL SERVICE TERMINAL</span><button class="admin__close" type="button" aria-label="Close console">×</button></header><div class="admin__output" role="log" aria-live="polite"></div><form class="admin__form"><label for="admin-command">&gt;</label><input id="admin-command" class="admin__input" type="text" autocomplete="off" spellcheck="false" aria-label="Console command"><span class="admin__hint">ENTER TO RUN</span></form>';
    document.body.append(this.root);

    this.output = this.root.querySelector('.admin__output');
    this.form = this.root.querySelector('.admin__form');
    this.input = this.root.querySelector('.admin__input');
    this.root.querySelector('.admin__close').addEventListener('click', () => this.close());
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const line = this.input.value;
      this.input.value = '';
      this.exec(line);
    });
    this._toggleHandler = (event) => this._onGlobalKey(event);
    document.addEventListener('keydown', this._toggleHandler, true);
    document.addEventListener('keyup', this._toggleHandler, true);

    this._registerBuiltins();
    this.write('Developer console ready. Type /help or help for commands.', 'system');
  }

  register(name, help, run) {
    const key = String(name).trim().toLowerCase();
    if (!key || typeof run !== 'function') throw new TypeError('Command requires a name and run function');
    this.commands[key] = { help: String(help), run };
    return this;
  }

  _registerBuiltins() {
    if (this.game.isLegacyGame) {
      this._registerLegacyBuiltins();
      return;
    }
    this.register('help', 'list available commands', () =>
      Object.entries(this.commands).map(([name, command]) => `${name.padEnd(12)} ${command.help}`).join('\n'));
    this.register('noclip', 'toggle player collision', () => {
      this.game.noclip = !this.game.noclip;
      return `noclip ${this.game.noclip ? 'enabled' : 'disabled'}`;
    });
    this.register('god', 'toggle player invulnerability', () => {
      this.player.godmode = !this.player.godmode;
      return `godmode ${this.player.godmode ? 'enabled' : 'disabled'}`;
    });
    this.register('tp', 'tp <roomId>  teleport to a room', (args) => {
      const index = this._roomIndex(args[0]);
      if (index < 0) return 'Room not found. Use rooms to list room ids.';
      this.game.enterRoom(index);
      return `Teleported to ${this.game.room.desc.label}`;
    });
    this.register('spawn', 'spawn <chaser|rush|ambush> [room]', (args) => {
      if (!args[0]) return 'Usage: spawn <chaser|rush|ambush> [room]';
      const roomIndex = args[1] ? this._roomIndex(args[1]) : this.game.roomIndex;
      if (roomIndex < 0) return 'Room not found. Use rooms to list room ids.';
      if (roomIndex !== this.game.roomIndex) this.game.enterRoom(roomIndex);
      const entity = this.entities?.spawn(args[0].toLowerCase(), roomIndex);
      return entity ? `Spawned ${entity.type ?? args[0]} in Room ${String(roomIndex + 1).padStart(3, '0')}` : 'Entity manager is unavailable or rejected that entity.';
    });
    this.register('kill', 'kill <entityId|entityType>', (args) => {
      if (!args[0]) return 'Usage: kill <entityId|entityType>';
      const removed = this.entities?.kill(args[0]);
      return removed ? `Removed ${args[0]}` : `No active entity matched ${args[0]}`;
    });
    this.register('promote', `promote <username> <role>  roles: ${CHAT_ROLES.join(', ')}`, (args) => {
      const username = args[0];
      const requestedRole = args.slice(1).join(' ').toLowerCase();
      const role = CHAT_ROLES.find((candidate) => candidate.toLowerCase() === requestedRole);
      if (!username || !requestedRole) return 'Usage: promote <username> <role>';
      if (username.toLowerCase() === 'hunao') return 'HuNao is the Owner and cannot be promoted.';
      if (!role) return `Choose a role from: ${CHAT_ROLES.join(', ')}`;
      const sent = this.game.multiplayer?.ws?.promoteUser(username, role);
      return sent ? `Promotion request sent for ${username}.` : 'Connect to the party server first.';
    });
    this.register('set', 'set <key> <value>  change a runtime tuning value', (args) => this._setValue(args));
    this.register('lamp', 'toggle the player lamp', () => {
      this.player.lampState = this.player.lampState === 'on' ? 'off' : 'on';
      return `lamp ${this.player.lampState}`;
    });
    this.register('timescale', 'timescale <n>  set simulation speed (0 to 4)', (args) => {
      const value = Number(args[0]);
      if (!Number.isFinite(value) || value < 0 || value > 4) return 'Timescale must be between 0 and 4.';
      this.game.timeScale = value;
      return `timescale ${value}`;
    });
    this.register('hide', 'toggle player hidden state', () => {
      this.player.hidden = !this.player.hidden;
      return `hidden ${this.player.hidden ? 'on' : 'off'}`;
    });
    this.register('rooms', 'list loaded room ids', () => {
      const rooms = this.game.run?.rooms ?? [];
      return rooms.length ? rooms.map((room, index) => `${String(index + 1).padStart(3, '0')}  ${room.label}  ${room.archetype}`).join('\n') : 'No run is loaded.';
    });
    this.register('clear', 'clear console output', () => {
      this.output.replaceChildren();
      return '';
    });
    this.register('close', 'close the developer console', () => {
      queueMicrotask(() => this.close());
      return 'Closing developer console.';
    });
    this.register('terminal', 'close the developer console', () => {
      queueMicrotask(() => this.close());
      return 'Closing developer console.';
    });
    this.register('stats', 'toggle the FPS and draw-call overlay', () => {
      this.game.statsElement.hidden = !this.game.statsElement.hidden;
      return `stats ${this.game.statsElement.hidden ? 'disabled' : 'enabled'}`;
    });
  }

  _registerLegacyBuiltins() {
    this.register('help', 'list available commands', () =>
      Object.entries(this.commands).map(([name, command]) => `${name.padEnd(12)} ${command.help}`).join('\n'));
    this.register('rooms', 'list the 100 generated hotel rooms', () => {
      const plans = Array.from({ length: 100 }, (_, index) =>
        this.game.legacyRoomPlan(index + 1));
      return plans.map((room) => `${String(room.roomNum).padStart(3, '0')}  ${room.roomType.padEnd(10)} ${room.subtitle}`).join('\n');
    });
    this.register('tp', 'tp <roomId>  teleport to a room (001–100)', (args) => {
      const roomNum = this._roomIndex(args[0]);
      if (roomNum < 0) return 'Room not found. Use rooms to list generated rooms.';
      if (!this.game.isAlive) return 'Start a run before teleporting.';
      this.game.warpToRoom(roomNum);
      return `Teleported to Room ${String(roomNum).padStart(3, '0')}.`;
    });
    this.register('spawn', 'spawn <chaser|rush|ambush> [room]', (args) => {
      const type = String(args[0] ?? '').toLowerCase();
      if (!['chaser', 'rush', 'ambush'].includes(type)) return 'Usage: spawn <chaser|rush|ambush> [room]';
      if (args[1]) {
        const roomNum = this._roomIndex(args[1]);
        if (roomNum < 0) return 'Room not found. Use rooms to list generated rooms.';
        if (!this.game.isAlive) return 'Start a run before changing rooms.';
        if (roomNum !== this.game.currentRoomNum) this.game.warpToRoom(roomNum);
      }
      if (!this.game.isAlive || !this.game.currentRoomData) return 'Start a run before spawning an encounter.';
      if (type === 'rush') this.game.spawnRushOrAmbush(false);
      else if (type === 'ambush') this.game.spawnRushOrAmbush(true);
      else this.game.spawnSeekChase(this.game.currentRoomData);
      const entity = type === 'rush' || type === 'ambush' ? this.game.rushEntity : this.game.seekEntity;
      return entity ? `Spawned ${type}: ${entity.id}` : `Could not spawn ${type}; an encounter may already be active.`;
    });
    this.register('kill', 'kill <entityId|entityType|all>', (args) => {
      if (!args[0]) return 'Usage: kill <entityId|entityType|all>';
      return this.game.removeLegacyEntity(args[0]);
    });
    this.register('noclip', 'toggle room boundary collision', () => {
      this.game.noclip = !this.game.noclip;
      return `noclip ${this.game.noclip ? 'enabled' : 'disabled'}`;
    });
    this.register('god', 'toggle player invulnerability', () => {
      this.game.godmode = !this.game.godmode;
      return `godmode ${this.game.godmode ? 'enabled' : 'disabled'}`;
    });
    this.register('timescale', 'timescale <n>  set simulation speed (0 to 4)', (args) => {
      const value = Number(args[0]);
      if (!Number.isFinite(value) || value < 0 || value > 4) return 'Timescale must be between 0 and 4.';
      this.game.timeScale = value;
      return `timescale ${value}`;
    });
    this.register('stats', 'toggle FPS and draw-call statistics', () => {
      this.game.statsElement.hidden = !this.game.statsElement.hidden;
      return `stats ${this.game.statsElement.hidden ? 'disabled' : 'enabled'}`;
    });
    this.register('heal', 'heal [amount]  restore vitality', (args) => {
      const amount = args[0] === undefined ? 100 : Number(args[0]);
      if (!Number.isFinite(amount) || amount < 0) return 'Usage: heal [amount]';
      this.game.hp = Math.min(100, this.game.hp + amount);
      this.game.updateHUD();
      return `Vitality: ${Math.ceil(this.game.hp)} / 100`;
    });
    this.register('damage', 'damage <amount>  test damage and death effects', (args) => {
      const amount = Number(args[0]);
      if (!Number.isFinite(amount) || amount < 0) return 'Usage: damage <amount>';
      this.game.damagePlayer(amount, 'Admin', 'Administrative damage test.');
      return `Applied ${amount} damage.`;
    });
    this.register('gold', 'gold [amount]  add or set gold', (args) => {
      const amount = Number(args[0]);
      if (!Number.isFinite(amount)) return `Gold: ${this.game.gold}`;
      this.game.gold = Math.max(0, Math.floor(amount));
      this.game.updateHUD();
      return `Gold: ${this.game.gold}`;
    });
    this.register('where', 'show current room and player coordinates', () => {
      const p = this.game.playerPos;
      return `Room ${String(this.game.currentRoomNum).padStart(3, '0')} · ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
    });
    this.register('inventory', 'list current inventory', () =>
      this.game.inventory.length
        ? this.game.inventory.map((item, index) => `${index + 1}. ${item.name} (${item.charges ?? 0})`).join('\n')
        : 'Inventory is empty.');
    this.register('give', 'give <lighter|flashlight|vitamins|lockpick|crucifix>', (args) => {
      const id = String(args[0] ?? '').toLowerCase();
      const items = {
        lighter: ['Lighter', '🔥', 100], flashlight: ['Flashlight', '🔦', 100],
        vitamins: ['Vitamins', '💊', 3], lockpick: ['Lockpick', '🗝️', 3], crucifix: ['Crucifix', '✝️', 1],
      };
      const item = items[id];
      if (!item) return 'Usage: give <lighter|flashlight|vitamins|lockpick|crucifix>';
      this.game.addItem({ id, name: item[0], icon: item[1], charges: item[2], maxCharges: item[2] });
      return `Added ${item[0]}.`;
    });
    this.register('revive', 'revive the player and clear death state', () => {
      this.game.revivePlayer();
      return 'Player revived.';
    });
    this.register('restart', 'restart the current run from Reception', () => {
      this.game.startNewRun();
      return 'Run restarted at Reception.';
    });
    this.register('close', 'close the developer console', () => {
      queueMicrotask(() => this.close());
      return 'Closing developer console.';
    });
    this.register('terminal', 'close the developer console', () => {
      queueMicrotask(() => this.close());
      return 'Closing developer console.';
    });
  }

  _isOwner() {
    const username = this.game.ownerSession?.username;
    return isAdminUsername(username);
  }

  _readHistory() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]');
      return Array.isArray(saved) ? saved.filter((line) => typeof line === 'string').slice(-MAX_HISTORY) : [];
    } catch {
      return [];
    }
  }

  _saveHistory() {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(this.history.slice(-MAX_HISTORY)));
    } catch {
      // Storage can be disabled by browser privacy settings.
    }
  }

  write(text, kind = 'result') {
    if (!text) return;
    const line = document.createElement('div');
    line.className = `admin__line admin__line--${kind}`;
    line.textContent = text;
    this.output.append(line);
    while (this.output.childElementCount > MAX_OUTPUT) this.output.firstElementChild.remove();
    this.output.scrollTop = this.output.scrollHeight;
  }

  exec(line) {
    let commandLine = String(line ?? '').trim();
    if (commandLine.startsWith('/')) commandLine = commandLine.slice(1).trim();
    if (!commandLine) return '';
    this.write(`> ${commandLine}`, 'command');
    if (this.history.at(-1) !== commandLine) {
      this.history.push(commandLine);
      this.history = this.history.slice(-MAX_HISTORY);
      this._saveHistory();
    }
    this.historyIndex = this.history.length;

    const [name, ...args] = commandLine.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    const cleanArgs = args.map((arg) => arg.replace(/^("|')|("|')$/g, ''));
    const command = this.commands[name.toLowerCase()];
    if (!command) {
      this.write(`Unknown command: ${name}. Type help for a list.`, 'error');
      return '';
    }
    try {
      const result = command.run(cleanArgs);
      if (result !== undefined && result !== null && result !== '') this.write(String(result), 'result');
      return result ?? '';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.write(message, 'error');
      return '';
    }
  }

  _roomIndex(id) {
    if (this.game.isLegacyGame) {
      const text = String(id ?? '').trim().toLowerCase();
      const number = Number(text.replace(/^(room|door)\s*0*/, ''));
      return Number.isInteger(number) && number >= 1 && number <= 100 ? number : -1;
    }
    const rooms = this.game.run?.rooms ?? [];
    if (!rooms.length || !id) return -1;
    const text = String(id).trim().toLowerCase();
    const number = Number(text.replace(/^room\s*0*/, ''));
    if (Number.isInteger(number) && number >= 1 && number <= rooms.length) return number - 1;
    return rooms.findIndex((room) => room.label.toLowerCase() === text);
  }

  _setValue(args) {
    const path = args[0]?.split('.');
    if (!path?.length || path.some((part) => !part || BLOCKED_PATHS.has(part))) return 'Usage: set <key> <value>';
    const valueText = args.slice(1).join(' ');
    if (!valueText) return 'Usage: set <key> <value>';
    const isPlayerSetting = path[0] === 'player';
    const root = isPlayerSetting ? this.player : this.game.tuning;
    const segments = isPlayerSetting ? path.slice(1) : path;
    if (!root || path[0] === 'scene' || path[0] === 'game') return 'set supports player.* and tuning keys only.';
    let target = root;
    for (const part of segments.slice(0, -1)) {
      if (!target[part] || typeof target[part] !== 'object') return `Unknown setting: ${args[0]}`;
      target = target[part];
    }
    const key = segments.at(-1);
    if (!(key in target) || typeof target[key] === 'object') return `Unknown setting: ${args[0]}`;
    const oldValue = target[key];
    let value = valueText;
    if (typeof oldValue === 'number') {
      value = Number(valueText);
      if (!Number.isFinite(value)) return 'Value must be a finite number.';
    } else if (typeof oldValue === 'boolean') {
      if (!['true', 'false'].includes(valueText.toLowerCase())) return 'Value must be true or false.';
      value = valueText.toLowerCase() === 'true';
    }
    target[key] = value;
    return `${args[0]}: ${oldValue} -> ${value}`;
  }

  _onGlobalKey(event) {
    if (!this.enabled) return;
    const editing = event.target?.closest?.('input, textarea, [contenteditable="true"]');
    if (editing && !(this.opened && editing === this.input)) return;
    const shortcut = event.code === 'Backquote' || (event.code === 'Slash' && !this.opened) || (event.code === 'KeyA' && event.ctrlKey && event.shiftKey);
    if (event.type === 'keydown' && shortcut && !event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!this._isOwner()) {
        this.game.showBanner?.('The Admin terminal is restricted to owner accounts.');
        return;
      }
      this.toggle();
      return;
    }
    if (this.opened && !this._isOwner()) {
      this.close();
      return;
    }
    if (this.opened) this._trap(event);
  }

  _trap(event) {
    event.stopImmediatePropagation();
    if (event.type !== 'keydown') return;
    if (event.code === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.code === 'Tab') {
      event.preventDefault();
      this._complete();
    } else if (event.code === 'ArrowUp') {
      event.preventDefault();
      this.historyIndex = Math.max(0, this.historyIndex - 1);
      this.input.value = this.history[this.historyIndex] ?? '';
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    } else if (event.code === 'ArrowDown') {
      event.preventDefault();
      this.historyIndex = Math.min(this.history.length, this.historyIndex + 1);
      this.input.value = this.history[this.historyIndex] ?? '';
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    }
  }

  _complete() {
    const tokens = this.input.value.split(/\s+/);
    const prefix = tokens.at(-1).toLowerCase().replace(/^\//, '');
    let candidates = [];
    if (tokens.length === 1) {
      candidates = Object.keys(this.commands).filter((name) => name.startsWith(prefix));
    } else if ((tokens[0].toLowerCase() === 'tp' && tokens.length >= 2) || (tokens[0].toLowerCase() === 'spawn' && tokens.length >= 3)) {
      const rooms = this.game.isLegacyGame
        ? Array.from({ length: 100 }, (_, index) => String(index + 1).padStart(3, '0'))
        : (this.game.run?.rooms ?? []).map((room, index) => String(index + 1).padStart(3, '0'));
      candidates = rooms.filter((id) => id.startsWith(prefix));
    }
    if (candidates.length === 1) {
      tokens[tokens.length - 1] = candidates[0];
      this.input.value = tokens.join(' ') + (tokens.length === 1 ? ' ' : ' ');
    } else if (candidates.length > 1) {
      this.write(candidates.join('  '), 'system');
    }
  }

  open() {
    if (this.opened) return;
    if (!this._isOwner()) {
      this.game.showBanner?.('The Admin terminal is restricted to owner accounts.');
      return;
    }
    this.opened = true;
    const movement = this.game.isLegacyGame ? this.game.moveState : this.game.input?.keys;
    if (movement) Object.assign(movement, { forward: false, back: false, backward: false, left: false, right: false });
    if (this.game.isLegacyGame) {
      this.game.isSprinting = false;
      this.game.isCrouching = false;
    }
    if (this.game.input) {
      this.game.input.sprint = false;
      this.game.input.crouch = false;
    }
    this.root.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.input.focus();
  }

  close() {
    if (!this.opened) return;
    this.opened = false;
    this.root.hidden = true;
    const movement = this.game.isLegacyGame ? this.game.moveState : this.game.input?.keys;
    if (movement) Object.assign(movement, { forward: false, back: false, backward: false, left: false, right: false });
    if (this.game.input) {
      this.game.input.sprint = false;
      this.game.input.crouch = false;
      this.game.input.interactPressed = false;
      this.game.input.usePressed = false;
      this.game.input.dropPressed = false;
    }
    this.input.blur();
    if (this.game.state === 'playing') this.game.requestLock?.();
    else if (this.game.isLegacyGame && this.game.isAlive) {
      try {
        const lockRequest = this.game.canvas.requestPointerLock?.();
        lockRequest?.catch?.(() => {});
      } catch {
        // Pointer lock may be denied when a browser requires a fresh gesture.
      }
    }
  }

  toggle() {
    if (this.opened) this.close();
    else this.open();
  }

  destroy() {
    document.removeEventListener('keydown', this._toggleHandler, true);
    document.removeEventListener('keyup', this._toggleHandler, true);
    this.root.remove();
    this.opened = false;
  }
}

export default Admin;

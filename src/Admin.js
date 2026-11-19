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
    this.write('Developer console ready. Type help for commands.', 'system');
  }

  register(name, help, run) {
    const key = String(name).trim().toLowerCase();
    if (!key || typeof run !== 'function') throw new TypeError('Command requires a name and run function');
    this.commands[key] = { help: String(help), run };
    return this;
  }

  _registerBuiltins() {
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
    this.register('stats', 'toggle the FPS and draw-call overlay', () => {
      this.game.statsElement.hidden = !this.game.statsElement.hidden;
      return `stats ${this.game.statsElement.hidden ? 'disabled' : 'enabled'}`;
    });
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
    const commandLine = String(line ?? '').trim();
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
    const toggle = event.code === 'Backquote' || event.code === 'Slash' || (event.code === 'KeyA' && event.ctrlKey && event.shiftKey);
    if (event.type === 'keydown' && toggle && !event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.toggle();
      return;
    }
    if (this.opened) this._trap(event);
  }

  _trap(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== 'keydown') return;
    if (event.code === 'Escape') {
      this.close();
    } else if (event.code === 'Tab') {
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
    const prefix = tokens.at(-1).toLowerCase();
    let candidates = [];
    if (tokens.length === 1) {
      candidates = Object.keys(this.commands).filter((name) => name.startsWith(prefix));
    } else if ((tokens[0].toLowerCase() === 'tp' && tokens.length >= 2) || (tokens[0].toLowerCase() === 'spawn' && tokens.length >= 3)) {
      const rooms = this.game.run?.rooms ?? [];
      candidates = rooms.map((room, index) => String(index + 1).padStart(3, '0')).filter((id) => id.startsWith(prefix));
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
    this.opened = true;
    this.root.hidden = false;
    this.input.focus();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  close() {
    if (!this.opened) return;
    this.opened = false;
    this.root.hidden = true;
    this.player && Object.assign(this.game.input?.keys ?? {}, { forward: false, back: false, left: false, right: false });
    if (this.game.input) {
      this.game.input.sprint = false;
      this.game.input.crouch = false;
      this.game.input.interactPressed = false;
      this.game.input.usePressed = false;
      this.game.input.dropPressed = false;
    }
    this.input.blur();
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

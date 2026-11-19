import * as THREE from 'three';
import { Door } from '../world/Door.js';
import { Room } from '../world/Room.js';
import { generateRun, mulberry32, ROOM_COUNT } from '../world/roomGen.js';
import { doorCreak, unlockAudio } from '../entities/sfx.js';
import { MainMenu } from '../ui/MainMenu.js';
import { OptionsMenu } from '../ui/OptionsMenu.js';
import { MultiplayerMenu } from '../ui/MultiplayerMenu.js';
import { PartyChat } from '../ui/PartyChat.js';
import { Admin } from '../Admin.js';
import { EntityManager } from '../entities/EntityManager.js';
import { DIFFICULTY, DIFFICULTY_TIERS, ENTITY_SPAWN, HEALTH, NOISE, SPEED, STAMINA } from '../data/balance.js';

export class Run {
  constructor({ scene, renderer, input, player, camera, hud, prompt, reticle }) {
    Object.assign(this, { scene, renderer, input, player, camera, hud, prompt, reticle });
    this.timeScale = 1;
    this.noclip = false;
    this.tuning = { DIFFICULTY, ENTITY_SPAWN, HEALTH, NOISE, SPEED, STAMINA };
    this.scene.clear();
    this.scene.background = new THREE.Color(0x0a0705);
    this.scene.fog = new THREE.FogExp2(0x0a0705, 0.045);
    this.scene.add(new THREE.AmbientLight(0x8a7560, 0.16));
    this.scene.add(new THREE.HemisphereLight(0xb9a68c, 0x17100c, 0.18));

    this.lamp = new THREE.SpotLight(0xffd49a, 28, 24, Math.PI / 7, 0.45, 1.4);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(512, 512);
    this.scene.add(this.lamp, this.lamp.target);
    this.statsElement = document.createElement('output');
    this.statsElement.className = 'dev-stats';
    this.statsElement.hidden = true;
    document.body.append(this.statsElement);
    this.statsFrames = 0;
    this.statsElapsed = 0;

    this.menu = new MainMenu({
      onStart: () => { this.start(); this.requestLock(); },
      onResume: () => this.requestLock(),
      onRestart: () => { this.start(); this.requestLock(); },
      onOptions: () => {
        this.menu.setMode('hidden');
        this.options.open();
      },
      onMultiplayer: () => {
        this.menu.setMode('hidden');
        this.multiplayer.open();
      },
    });
    this.options = new OptionsMenu({
      game: this,
      renderer,
      onClose: () => this.menu.setMode('title'),
    });
    this.ownerSession = null;
    this.networkPlayers = new Map();
    this.partyStarted = false;
    this.partySyncElapsed = 0;
    this.partyChat = new PartyChat({ game: this });
    this.multiplayer = new MultiplayerMenu({
      onClose: () => this.menu.setMode('title'),
      onSession: (session) => { this.ownerSession = session; },
      onChat: (message) => this.partyChat.receive(message),
      onPartyStarted: (party) => this.startPartyMatch(party),
      onPartyLeft: () => {
        this.partyStarted = false;
        this.networkPlayers.clear();
      },
      onPlayerState: (state) => this.updateRemotePlayer(state),
      onRoomState: (state) => this.syncPartyRoom(state),
    });
    this.state = 'title';
    this.inventory = { keys: 0, coins: 0, slots: [null, null, null, null, null] };
    this.message = '';
    this.messageUntil = 0;
    this.target = null;
    this.entities = new EntityManager({ game: this, scene, player });
    this.admin = new Admin({ game: this, scene, player, entities: this.entities });

    if (this.state === 'title') {
      this.menu.setMode('hidden');
      this.multiplayer.open();
    }

    document.addEventListener('pointerlockchange', () => {
      if (this.state === 'playing' && !this.admin.opened && this.input.locked) {
        this.menu.setMode('hidden');
      }
    });
  }

  requestLock() {
    if (!this.input.locked) this.renderer.domElement.requestPointerLock();
  }

  startPartyMatch(party) {
    if (this.partyStarted) return;
    try {
      this.difficulty = party.difficulty ?? 'Normal';
      this.partyStarted = true;
      this.multiplayer.root.hidden = true;
      this.start(party.runSeed, party.roomIndex ?? 0);
      this.syncRemotePlayers(party.members ?? []);
      this.requestLock();
    } catch (error) {
      this.partyStarted = false;
      this.multiplayer.root.hidden = false;
      console.error('Party start failed:', error);
      this.multiplayer.setLobbyStatus(`Could not start: ${error instanceof Error ? error.message : 'runtime error'}`, 'error');
    }
  }

  syncPartyRoom(state) {
    if (!this.partyStarted) return;
    const roomIndex = Math.max(0, Math.min(100, Number(state.roomIndex) || 0));
    if (roomIndex !== this.roomIndex) this.enterRoom(roomIndex, false);
  }

  createRemotePlayer(username) {
    const group = new THREE.Group();
    const clothes = new THREE.MeshStandardMaterial({ color: 0x59695f, roughness: 0.72 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xb79a82, roughness: 0.82 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0x171513, roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.52, 4, 8), clothes);
    torso.position.y = 0.92;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8), skin);
    head.position.y = 1.55;
    group.add(head);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.48, 3, 6), clothes);
      arm.position.set(side * 0.34, 0.92, 0);
      group.add(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.48, 3, 6), shoe);
      leg.position.set(side * 0.13, 0.34, 0);
      group.add(leg);
    }
    group.position.set((this.networkPlayers.size + 1) * 1.2, 0, this.room?.length / 2 - 2.8 ?? 4);
    group.userData.username = username;
    this.scene.add(group);
    this.networkPlayers.set(username, group);
  }

  syncRemotePlayers(members = []) {
    for (const username of members) {
      if (username !== this.multiplayer.account && !this.networkPlayers.has(username)) this.createRemotePlayer(username);
    }
  }

  updateRemotePlayer(state) {
    if (!state.username || state.username === this.multiplayer.account) return;
    if (!this.networkPlayers.has(state.username)) this.createRemotePlayer(state.username);
    const mesh = this.networkPlayers.get(state.username);
    mesh.position.set(state.x, state.y, state.z);
    mesh.rotation.y = state.yaw;
  }

  start(seed = Math.floor(Math.random() * 0xffffffff), roomIndex = 0) {
    this.entities.clear();
    this.clearRoom();
    this.run = generateRun(seed >>> 0, ROOM_COUNT);
    this.inventory.keys = 0;
    this.inventory.coins = 0;
    this.inventory.slots = [null, null, null, null, null];
    this.player.hidden = false;
    this.player.health = this.player.maxHealth;
    this.player.stamina = 100;
    this.player.yaw = 0;
    this.player.pitch = 0;
    this.state = 'playing';
    this.enterRoom(0, false);
    if (roomIndex > 0) this.enterRoom(roomIndex, false);
    this.menu.setMode('hidden');
    unlockAudio();
  }

  clearRoom() {
    if (!this.room) return;
    this.scene.remove(this.room.group);
    this.room.dispose();
    this.room = null;
  }

  enterRoom(index, syncParty = true) {
    this.entities?.clear();
    this.clearRoom();
    this.roomIndex = index;
    this.room = new Room(this.run.rooms[index]);
    Door.forRoom(this.room);
    this.scene.add(this.room.group);
    this.player.setBounds(this.room.getBounds());
    this.player.position.set(0, 0, this.room.length / 2 - 1.8);
    this.player.velocity.set(0, 0, 0);
    this.addRoomItems();
    if (index > 0) this.rollPartySpawns(index);
    if (syncParty && this.partyStarted && this.multiplayer.ws) {
      this.multiplayer.ws.sendRoomState(index);
    }
    this.setMessage(`${this.room.desc.label}  /  ${this.room.desc.archetype.replaceAll('_', ' ')}`, 2800);
  }

  rollPartySpawns(roomIndex) {
    if (!this.partyStarted) return;
    const tier = DIFFICULTY_TIERS[this.difficulty ?? 'Normal'] ?? DIFFICULTY_TIERS.Normal;
    const doorRamp = Math.min(DIFFICULTY.cap, 1 + Math.max(0, roomIndex - 1) * DIFFICULTY.perDoor);
    const chance = tier.spawnMultiplier * doorRamp;
    const rush = ENTITY_SPAWN.Rush;
    const ambush = ENTITY_SPAWN.Ambush;
    if (roomIndex >= rush.minDoor && Math.random() < rush.p * chance) this.entities.spawn('rush', roomIndex);
    if (roomIndex >= ambush.minDoor && Math.random() < ambush.p * chance) this.entities.spawn('ambush', roomIndex);
  }

  addRoomItems() {
    const rand = mulberry32(this.room.desc.seedOffset ^ 0x4b455953);
    const next = this.run.rooms[this.roomIndex + 1];
    if (next?.lock.type === 'key') this.addPickup('key', -this.room.width / 2 + 0.8, 1.2);
    if (rand() < 0.32) this.addPickup('medkit', (rand() - 0.5) * (this.room.width - 2), (rand() - 0.5) * (this.room.length - 4));
    if (this.room.desc.lock.type === 'code') this.addCodePlaque(this.room.desc.lock.code);
  }

  addPickup(type, x, z) {
    const group = new THREE.Group();
    const color = type === 'key' ? 0xd9ad62 : type === 'coin' ? 0xd3a84f : type === 'flashlight' ? 0x6f8f94 : 0xb34238;
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, metalness: type === 'key' ? 0.65 : 0.05, roughness: 0.4 });
    this.room.ownedMaterials.add(material);
    if (type === 'key') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 16), material);
      ring.position.y = 0.12;
      group.add(ring);
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.045, 0.045), material);
      stem.position.set(0.18, 0.12, 0);
      group.add(stem);
    } else if (type === 'coin') {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 16), material);
      coin.rotation.x = Math.PI / 2;
      group.add(coin);
    } else if (type === 'flashlight') {
      const flashlight = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.28, 10), material);
      flashlight.rotation.z = Math.PI / 2;
      group.add(flashlight);
    } else {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.2), material));
      const crossMaterial = new THREE.MeshStandardMaterial({ color: 0xe9ded0 });
      this.room.ownedMaterials.add(crossMaterial);
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.21), crossMaterial);
      group.add(cross);
    }
    group.position.set(x, 0.16, z);
    group.userData.type = type;
    this.room.group.add(group);
    this.room.pickups ??= [];
    this.room.pickups.push(group);
  }

  addCodePlaque(code) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 220;
    const context = canvas.getContext('2d');
    context.fillStyle = '#211d18';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#9b7952';
    context.lineWidth = 10;
    context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    context.textAlign = 'center';
    context.fillStyle = '#c9b58f';
    context.font = '26px monospace';
    context.fillText('SERVICE ACCESS', 256, 72);
    context.fillStyle = '#f1dfbd';
    context.font = 'bold 82px monospace';
    context.fillText(code, 256, 172);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 });
    this.room.ownedMaterials.add(material);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.42), material);
    plaque.position.set(-this.room.width / 2 + 0.11, 1.55, this.room.length / 2 - 1.5);
    plaque.rotation.y = Math.PI / 2;
    this.room.group.add(plaque);
  }

  collides(x, z) {
    if (this.noclip) return false;
    return this.room.colliders.some((box) =>
      x + 0.22 > box.minX && x - 0.22 < box.maxX &&
      z + 0.22 > box.minZ && z - 0.22 < box.maxZ
    );
  }

  updateStats(dt) {
    if (this.statsElement.hidden || !Number.isFinite(dt) || dt <= 0) return;
    this.statsFrames += 1;
    this.statsElapsed += dt;
    if (this.statsElapsed < 0.5) return;
    const fps = Math.round(this.statsFrames / this.statsElapsed);
    this.statsElement.textContent = `${fps} FPS  /  ${this.renderer.info.render.calls} draw calls`;
    this.statsFrames = 0;
    this.statsElapsed = 0;
  }

  findTarget() {
    const origin = this.player.eyePosition;
    const forward = new THREE.Vector3(
      -Math.sin(this.player.yaw) * Math.cos(this.player.pitch),
      Math.sin(this.player.pitch),
      -Math.cos(this.player.yaw) * Math.cos(this.player.pitch)
    );
    let target = null;
    let bestDistance = 2.4;
    for (const candidate of [
      this.room.door.group,
      ...(this.room.pickups ?? []),
      ...(this.room.drawers ?? []).map((drawer) => drawer.object),
      ...(this.room.sideDoors ?? []).map((sideDoor) => sideDoor.object),
      ...(this.room.hidingSpots ?? []).map((spot) => spot.object),
    ]) {
      const point = new THREE.Vector3();
      candidate.getWorldPosition(point);
      const offset = point.sub(origin);
      const distance = offset.length();
      if (distance > bestDistance || offset.normalize().dot(forward) < 0.45) continue;
      target = candidate === this.room.door.group
        ? { type: 'door', object: this.room.door }
        : candidate.userData.drawer
          ? { type: 'drawer', object: candidate }
          : candidate.userData.hidingSpot
            ? { type: 'locker', object: candidate }
            : candidate.userData.sideRoomDoor
              ? { type: 'sideDoor', object: candidate }
              : { type: candidate.userData.type, object: candidate };
      bestDistance = distance;
    }
    return target;
  }

  addItem(type) {
    const empty = this.inventory.slots.findIndex((slot) => slot === null);
    if (empty < 0) {
      this.setMessage('Hotbar is full');
      return false;
    }
    this.inventory.slots[empty] = type;
    this.setMessage(`${type === 'coin' ? 'Coin' : type === 'medkit' ? 'Medkit' : 'Flashlight'} stored in slot ${empty + 1}`);
    return true;
  }

  useSelectedItem() {
    const slotIndex = this.input.selectedSlot;
    const item = this.inventory.slots[slotIndex];
    if (!item) {
      this.setMessage(`Slot ${slotIndex + 1} is empty`);
      return;
    }
    if (item === 'medkit') {
      if (this.player.health >= this.player.maxHealth) {
        this.setMessage('Health is already full');
        return;
      }
      this.player.heal(50);
      this.inventory.slots[slotIndex] = null;
      this.setMessage(`Medkit used  /  health ${this.player.health}`);
    } else if (item === 'flashlight') {
      this.player.lampState = this.player.lampState === 'on' ? 'off' : 'on';
      this.setMessage(`Flashlight ${this.player.lampState}`);
    } else if (item === 'coin') {
      this.inventory.coins += 1;
      this.inventory.slots[slotIndex] = null;
      this.setMessage(`Coin added  /  ${this.inventory.coins} coins`);
    }
  }

  interact() {
    if (!this.target) return;
    if (this.target.type === 'door') {
      const door = this.target.object;
      if (door.lock.type === 'code' && door.isLocked) {
        const code = window.prompt('Enter the service code shown on the wall plaque');
        if (code === null) return;
        const result = door.tryCode(code);
        this.setMessage(result.message);
        if (result.ok) doorCreak();
        return;
      }
      const wasOpen = door.isOpen;
      const result = door.interact(this.inventory);
      if (result.consumesKey) this.inventory.keys -= 1;
      this.setMessage(result.message);
      if (result.ok && !wasOpen) doorCreak();
      return;
    }

    if (this.target.type === 'drawer') {
      const drawer = this.target.object;
      if (drawer.userData.opened) {
        this.setMessage('Drawer is empty');
        return;
      }
      drawer.userData.opened = true;
      drawer.position.x += drawer.position.x > 0 ? 0.16 : -0.16;
      const reward = drawer.userData.reward;
      if (reward) {
        this.addItem(reward);
      } else {
        this.setMessage('The drawer is empty');
      }
      return;
    }
    if (this.target.type === 'locker') {
      const locker = this.room.hidingSpots.find((spot) => spot.object === this.target.object);
      if (locker) {
        this.player.hidden = !this.player.hidden;
        if (this.player.hidden) {
          this.player.position.set(locker.x, 0, locker.z);
          this.setMessage('Hidden in locker');
        } else {
          const exitDistance = 0.82;
          this.player.position.set(
            locker.x,
            0,
            locker.z + locker.facing * exitDistance
          );
          this.player.velocity.set(0, 0, 0);
          this.player.hidden = false;
          this.player.crouching = false;
          this.player.sprinting = false;
          this.player.moving = false;
          this.player.state = 'idle';
          this.input.clearOneShots();
          this.input.keys.forward = false;
          this.input.keys.back = false;
          this.input.keys.left = false;
          this.input.keys.right = false;
          this.setMessage('Left locker');
        }
      }
      return;
    }
    if (this.target.type === 'sideDoor') {
      const sideDoor = this.target.object;
      sideDoor.userData.open = !sideDoor.userData.open;
      sideDoor.rotation.y = sideDoor.userData.open ? 1.1 : (sideDoor.position.z % 1 < 0 ? -0.18 : 0.18);
      this.setMessage(sideDoor.userData.open ? 'Side-room door opened' : 'Side-room door closed');
      return;
    }

    if (this.target.type === 'key') {
      this.inventory.keys += 1;
      this.setMessage('Brass key collected');
    } else if (this.target.type === 'medkit') {
      this.addItem('medkit');
    } else if (this.target.type === 'coin') {
      this.addItem('coin');
    } else if (this.target.type === 'flashlight') {
      this.addItem('flashlight');
    }
    this.room.group.remove(this.target.object);
    this.room.pickups = this.room.pickups.filter((pickup) => pickup !== this.target.object);
  }

  setMessage(text, duration = 2200) {
    this.message = text;
    this.messageUntil = performance.now() + duration;
  }

  update(dt) {
    if (this.state !== 'playing' || this.partyChat?.opened) return;
    dt *= this.timeScale;
    if (this.partyStarted && this.multiplayer.ws) {
      this.partySyncElapsed += dt;
      if (this.partySyncElapsed >= 0.1) {
        this.partySyncElapsed = 0;
        this.multiplayer.ws.sendPlayerState({
          x: this.player.position.x,
          y: this.player.position.y,
          z: this.player.position.z,
          yaw: this.player.yaw,
          moving: this.player.moving,
          crouching: this.player.crouching,
        });
      }
    }
    if (this.admin.opened) {
      if (dt === 0) return;
      this.room.door.update(dt);
      this.room.update(performance.now());
      this.entities.update(dt);
      return;
    }
    if (!this.input.locked) return;
    if (this.input.lampPressed) this.player.lampState = this.player.lampState === 'on' ? 'off' : 'on';
    if (dt === 0) return;
    const oldX = this.player.position.x;
    const oldZ = this.player.position.z;
    const bounds = this.player.bounds;
    if (this.noclip) this.player.bounds = null;
    this.player.update(dt, this.input);
    this.player.bounds = bounds;
    if (!this.noclip) {
      if (this.collides(this.player.position.x, oldZ)) this.player.position.x = oldX;
      if (this.collides(this.player.position.x, this.player.position.z)) this.player.position.z = oldZ;
    }

    this.room.door.update(dt);
    this.player.bounds.minZ = this.room.door.isOpen
      ? -this.room.length / 2 - 0.5
      : -this.room.length / 2 + 0.35;
    this.room.update(performance.now());
    const forwardX = -Math.sin(this.player.yaw) * Math.cos(this.player.pitch);
    const forwardY = Math.sin(this.player.pitch);
    const forwardZ = -Math.cos(this.player.yaw) * Math.cos(this.player.pitch);
    this.lamp.position.copy(this.player.eyePosition);
    this.lamp.target.position.set(
      this.player.position.x + forwardX * 18,
      this.player.eyePosition.y + forwardY * 18,
      this.player.position.z + forwardZ * 18,
    );
    this.lamp.visible = this.player.lampState === 'on';
    this.entities.update(dt);
    this.target = this.findTarget();
    if (this.input.interactPressed) this.interact();
    if (this.input.usePressed) this.useSelectedItem();
    if (!this.player.alive) {
      this.state = 'dead';
      this.menu.setMode('death');
      document.exitPointerLock();
    }

    if (this.room.door.isOpen && this.player.position.z < -this.room.length / 2 + 0.25) {
      if (this.roomIndex + 1 >= this.run.count) {
        this.state = 'won';
        this.menu.setMode('win');
        document.exitPointerLock();
      } else {
        this.enterRoom(this.roomIndex + 1);
      }
    }
  }

  updateHUD() {
    const targetText = this.target?.type === 'door' ? this.target.object.prompt()
      : this.target?.type === 'key' ? '[E] Take key'
      : this.target?.type === 'medkit' ? '[E] Store medkit'
      : this.target?.type === 'coin' ? '[E] Take coin'
      : this.target?.type === 'flashlight' ? '[E] Take flashlight'
      : this.target?.type === 'drawer' ? '[E] Open drawer'
      : this.target?.type === 'locker' ? `[E] ${this.player.hidden ? 'Leave locker' : 'Hide in locker'}`
      : this.target?.type === 'sideDoor' ? '[E] Open side room' : '';
    const status = performance.now() < this.messageUntil ? this.message : '';
    const stamina = Math.round(this.player.stamina);
    const slots = this.inventory.slots.map((item, index) => `<span class="hotbar-slot ${index === this.input.selectedSlot ? 'active' : ''}"><b>${index + 1}</b>${item ? item.toUpperCase() : 'EMPTY'}</span>`).join('');
    this.hud.innerHTML = `<div class="hud-top"><span>UNKNOWN HOTEL</span><span>${this.room?.desc.label ?? 'ROOM 001'} / 100</span></div><div class="hud-vitals"><span>HEALTH <b>${this.player.health}</b><i><em style="width:${this.player.health}%"></em></i></span><span>STAMINA <b>${stamina}</b><i><em style="width:${stamina}%"></em></i></span><span>KEYS <b>${this.inventory.keys}</b></span><span>COINS <b>${this.inventory.coins}</b></span></div><div class="hud-state">${this.player.state.toUpperCase()}${status ? `  /  ${status}` : ''}</div><div class="hotbar">${slots}</div>`;
    this.prompt.textContent = targetText;
    this.reticle.classList.toggle('active', Boolean(this.target));
  }
}

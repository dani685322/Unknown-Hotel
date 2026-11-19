import * as THREE from 'three';
import { Door } from '../world/Door.js';
import { Room } from '../world/Room.js';
import { generateRun, mulberry32, ROOM_COUNT } from '../world/roomGen.js';
import { doorCreak, unlockAudio } from '../entities/sfx.js';
import { MainMenu } from '../ui/MainMenu.js';

export class Run {
  constructor({ scene, renderer, input, player, hud, prompt, reticle }) {
    Object.assign(this, { scene, renderer, input, player, hud, prompt, reticle });
    this.scene.clear();
    this.scene.background = new THREE.Color(0x111315);
    this.scene.fog = new THREE.Fog(0x111315, 14, 48);
    this.scene.add(new THREE.AmbientLight(0x9ba5ae, 1.35));
    this.scene.add(new THREE.HemisphereLight(0xb9c9d8, 0x24211d, 0.95));

    this.menu = new MainMenu({
      onStart: () => { this.start(); this.requestLock(); },
      onResume: () => this.requestLock(),
      onRestart: () => { this.start(); this.requestLock(); },
    });
    this.state = 'title';
    this.inventory = { keys: 0 };
    this.message = '';
    this.messageUntil = 0;
    this.target = null;

    document.addEventListener('pointerlockchange', () => {
      if (this.state === 'playing') this.menu.setMode(this.input.locked ? 'hidden' : 'pause');
    });
  }

  requestLock() {
    if (!this.input.locked) this.renderer.domElement.requestPointerLock();
  }

  start() {
    this.clearRoom();
    this.run = generateRun(Math.floor(Math.random() * 0xffffffff), ROOM_COUNT);
    this.inventory.keys = 0;
    this.player.health = this.player.maxHealth;
    this.player.stamina = 100;
    this.player.yaw = 0;
    this.player.pitch = 0;
    this.state = 'playing';
    this.enterRoom(0);
    this.menu.setMode('hidden');
    unlockAudio();
  }

  clearRoom() {
    if (!this.room) return;
    this.scene.remove(this.room.group);
    this.room.dispose();
    this.room = null;
  }

  enterRoom(index) {
    this.clearRoom();
    this.roomIndex = index;
    this.room = new Room(this.run.rooms[index]);
    Door.forRoom(this.room);
    this.scene.add(this.room.group);
    this.player.setBounds(this.room.getBounds());
    this.player.position.set(0, 0, this.room.length / 2 - 1.8);
    this.player.velocity.set(0, 0, 0);
    this.addRoomItems();
    this.setMessage(`${this.room.desc.label}  /  ${this.room.desc.archetype.replaceAll('_', ' ')}`, 2800);
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
    const color = type === 'key' ? 0xd9ad62 : 0xb34238;
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, metalness: type === 'key' ? 0.65 : 0.05, roughness: 0.4 });
    if (type === 'key') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 16), material);
      ring.position.y = 0.12;
      group.add(ring);
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.045, 0.045), material);
      stem.position.set(0.18, 0.12, 0);
      group.add(stem);
    } else {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.2), material));
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.21), new THREE.MeshStandardMaterial({ color: 0xe9ded0 }));
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
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.42), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }));
    plaque.position.set(-this.room.width / 2 + 0.11, 1.55, this.room.length / 2 - 1.5);
    plaque.rotation.y = Math.PI / 2;
    this.room.group.add(plaque);
  }

  collides(x, z) {
    return this.room.colliders.some((box) =>
      x + 0.22 > box.minX && x - 0.22 < box.maxX &&
      z + 0.22 > box.minZ && z - 0.22 < box.maxZ
    );
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
    for (const candidate of [this.room.door.group, ...(this.room.pickups ?? [])]) {
      const point = new THREE.Vector3();
      candidate.getWorldPosition(point);
      const offset = point.sub(origin);
      const distance = offset.length();
      if (distance > bestDistance || offset.normalize().dot(forward) < 0.45) continue;
      target = candidate === this.room.door.group
        ? { type: 'door', object: this.room.door }
        : { type: candidate.userData.type, object: candidate };
      bestDistance = distance;
    }
    return target;
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

    if (this.target.type === 'key') {
      this.inventory.keys += 1;
      this.setMessage('Brass key collected');
    } else {
      this.player.heal(30);
      this.setMessage(`First aid used  /  health ${this.player.health}`);
    }
    this.room.group.remove(this.target.object);
    this.room.pickups = this.room.pickups.filter((pickup) => pickup !== this.target.object);
  }

  setMessage(text, duration = 2200) {
    this.message = text;
    this.messageUntil = performance.now() + duration;
  }

  update(dt) {
    if (this.state !== 'playing' || !this.input.locked) return;
    const oldX = this.player.position.x;
    const oldZ = this.player.position.z;
    this.player.update(dt, this.input);
    if (this.collides(this.player.position.x, oldZ)) this.player.position.x = oldX;
    if (this.collides(this.player.position.x, this.player.position.z)) this.player.position.z = oldZ;

    this.room.door.update(dt);
    this.player.bounds.minZ = this.room.door.isOpen
      ? -this.room.length / 2 - 0.5
      : -this.room.length / 2 + 0.35;
    this.room.update(performance.now());
    this.target = this.findTarget();
    if (this.input.interactPressed) this.interact();

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
      : this.target?.type === 'medkit' ? '[E] Use first aid' : '';
    const status = performance.now() < this.messageUntil ? this.message : '';
    const stamina = Math.round(this.player.stamina);
    this.hud.innerHTML = `<div class="hud-top"><span>UNKNOWN HOTEL</span><span>${this.room?.desc.label ?? 'ROOM 001'} / 100</span></div><div class="hud-vitals"><span>HEALTH <b>${this.player.health}</b><i><em style="width:${this.player.health}%"></em></i></span><span>STAMINA <b>${stamina}</b><i><em style="width:${stamina}%"></em></i></span><span>KEYS <b>${this.inventory.keys}</b></span></div><div class="hud-state">${this.player.state.toUpperCase()}${status ? `  /  ${status}` : ''}</div>`;
    this.prompt.textContent = targetText;
    this.reticle.classList.toggle('active', Boolean(this.target));
  }
}

// src/world/Door.js — Phase 6: hinged door, locks (key / code), interaction
import * as THREE from 'three';
import { DOOR } from './Room.js';

const MAT = {
  panel: new THREE.MeshStandardMaterial({ color: 0x6b543c, roughness: 0.85 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x3a332b, roughness: 0.80 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.8, roughness: 0.35 }),
  badgeLocked: new THREE.MeshStandardMaterial({
    color: 0x3a0f10, emissive: 0xff2a2a, emissiveIntensity: 1.8,
  }),
  badgeOpen: new THREE.MeshStandardMaterial({
    color: 0x0f2a12, emissive: 0x35ff6a, emissiveIntensity: 1.1,
  }),
};

export const DoorState = {
  LOCKED: 'locked',
  CLOSED: 'closed',
  OPENING: 'opening',
  OPEN: 'open',
};

const PANEL_W = DOOR.width - 0.08;
const OPEN_ANGLE = -1.65;   // swings into the room the player is standing in

export class Door {
  constructor(desc, { parent = null, position = { x: 0, y: 0, z: 0 } } = {}) {
    this.desc = desc ?? {};
    this.lock = this.desc.lock ?? { type: 'none' };

    this.state = this.lock.type === 'none' ? DoorState.CLOSED : DoorState.LOCKED;

    this.angle = 0;
    this.targetAngle = 0;
    this.speed = 4.2;

    this.group = new THREE.Group();
    this.group.position.set(position.x, position.y, position.z);

    this._build();

    if (parent) parent.add(this.group);
  }

  /* ------------------------------------------------------------ geometry */
  _build() {
    // hinge pivot sits on the left edge of the opening
    this.pivot = new THREE.Group();
    this.pivot.position.set(-PANEL_W / 2, 0, 0);
    this.group.add(this.pivot);

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(PANEL_W, DOOR.height - 0.06, 0.06),
      MAT.panel
    );
    panel.position.set(PANEL_W / 2, DOOR.height / 2, 0);
    this.pivot.add(panel);
    this.panel = panel;

    // handle (player-facing side is +z)
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 8), MAT.metal);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(PANEL_W - 0.13, DOOR.height * 0.46, 0.06);
    this.pivot.add(handle);

    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), MAT.metal);
    rose.rotation.x = Math.PI / 2;
    rose.position.set(PANEL_W - 0.13, DOOR.height * 0.46, 0.045);
    this.pivot.add(rose);

    // lock / state badge
    this.badge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), MAT.badgeOpen);
    this.badge.position.set(PANEL_W - 0.13, DOOR.height * 0.62, 0.04);
    this.pivot.add(this.badge);

    // static frame trim around the opening
    const frameMat = MAT.frame;
    for (const s of [-1, 1]) {
      const jamb = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, DOOR.height, DOOR.thickness + 0.02), frameMat
      );
      jamb.position.set(s * (PANEL_W / 2 + 0.045), DOOR.height / 2, 0);
      this.group.add(jamb);
    }
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR.width + 0.04, 0.05, DOOR.thickness + 0.02), frameMat
    );
    head.position.set(0, DOOR.height + 0.025, 0);
    this.group.add(head);

    this._refreshBadge();
  }

  _refreshBadge() {
    const locked = this.state === DoorState.LOCKED;
    this.badge.material = locked ? MAT.badgeLocked : MAT.badgeOpen;
  }

  /* --------------------------------------------------------------- state */
  get isOpen() { return this.state === DoorState.OPEN || this.state === DoorState.OPENING; }
  get isLocked() { return this.state === DoorState.LOCKED; }
  get isBlocking() { return !this.isOpen; }

  // room-local rect used by Player collision while the door is shut
  getCollider() {
    const z = this.group.position.z;
    const x = this.group.position.x;
    return {
      minX: x - PANEL_W / 2,
      maxX: x + PANEL_W / 2,
      minZ: z - DOOR.thickness / 2,
      maxZ: z + DOOR.thickness / 2,
    };
  }

  /* --------------------------------------------------------- interaction */
  prompt() {
    if (this.isOpen) return 'Door is open';
    if (this.lock.type === 'key') return '[E] Locked — needs a key';
    if (this.lock.type === 'code') return '[E] Locked — enter 4-digit code';
    return '[E] Open door';
  }

  interact(inventory = { keys: 0 }) {
    if (this.isOpen) return { ok: true, message: 'Already open' };

    if (this.lock.type === 'key') {
      const keys = inventory.keys ?? 0;
      if (keys > 0) {
        this.unlock();
        this.open();
        return { ok: true, consumesKey: true, message: 'Unlocked with key' };
      }
      return { ok: false, needsKey: true, message: 'The lock holds — you need a key' };
    }

    if (this.lock.type === 'code') {
      return { ok: false, needsCode: true, message: 'Keypad: 4 digits' };
    }

    this.open();
    return { ok: true, message: 'Opened' };
  }

  tryCode(code) {
    if (this.lock.type !== 'code') return { ok: false, message: 'No keypad here' };
    if (String(code).trim() === String(this.lock.code)) {
      this.lock = { type: 'none' };
      this.unlock();
      this.open();
      return { ok: true, message: 'Code accepted' };
    }
    return { ok: false, message: 'Wrong code' };
  }

  unlock() {
    if (this.state === DoorState.LOCKED) this.state = DoorState.CLOSED;
    this._refreshBadge();
  }

  open() {
    if (this.isOpen) return;
    this.targetAngle = OPEN_ANGLE;
    this.state = DoorState.OPENING;
    this._refreshBadge();
  }

  close() {
    if (this.state !== DoorState.OPEN) return;
    this.targetAngle = 0;
    this.state = DoorState.CLOSED;
  }

  /* ------------------------------------------------------------- runtime */
  update(dt) {
    if (this.angle === this.targetAngle) return;

    const diff = this.targetAngle - this.angle;
    const step = this.speed * dt;
    this.angle += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
    this.pivot.rotation.y = this.angle;

    if (this.angle === this.targetAngle) {
      if (this.targetAngle === 0) this.state = DoorState.CLOSED;
      else this.state = DoorState.OPEN;
    }
  }

  dispose() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.group.clear();
  }

  /* -------------------------------------------------------------- helper */
  static forRoom(room, desc = room.desc) {
    const door = new Door(desc, {
      parent: room.group,
      position: { x: 0, y: 0, z: -room.length / 2 },
    });
    room.door = door;
    return door;
  }
}

export default Door;

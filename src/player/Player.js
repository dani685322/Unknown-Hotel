// src/player/Player.js — Phase 3: movement state, stamina, noise, health
import * as THREE from 'three';
import { SPEED, STAMINA, NOISE } from '../data/balance.js';

export const PlayerState = { IDLE: 'idle', WALK: 'walk', SPRINT: 'sprint', CROUCH: 'crouch' };

export class Player {
  constructor({ x = 0, z = 0 } = {}) {
    this.position = new THREE.Vector3(x, 0, z);
    this.velocity = new THREE.Vector3();

    this.yaw = 0;
    this.pitch = 0;

    this.standHeight = 1.6;
    this.crouchHeight = 0.95;

    this.maxHealth = 100;
    this.health = 100;
    this.stamina = STAMINA.max;

    this.crouching = false;
    this.sprinting = false;
    this.moving = false;
    this.state = PlayerState.IDLE;

    // class / admin flags
    this.godmode = false;
    this.silent = false;   // Hider class
    this.speedMul = 1;     // Vitamins / class buffs
    this.hidden = false;
    this.lampState = 'on';

    this.bounds = null;    // { minX, maxX, minZ, maxZ }
  }

  setBounds(b) { this.bounds = b; return this; }

  get eyeHeight() { return this.crouching ? this.crouchHeight : this.standHeight; }

  get eyePosition() {
    return new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  // 0 = silent, 1 = full sprint
  get noiseLevel() {
    if (this.silent) return 0;
    return this.state === PlayerState.SPRINT ? NOISE.sprint
         : this.state === PlayerState.CROUCH ? NOISE.crouch
         : this.state === PlayerState.WALK   ? NOISE.walk
         : 0;
  }

  update(dt, input) {
    // --- stance ---
    this.crouching = !!input.crouch;
    const axes = input.moveAxes();
    this.moving = axes.x !== 0 || axes.z !== 0;

    const wantsSprint = input.sprint && !this.crouching && this.moving;
    this.sprinting = wantsSprint && this.stamina > 0;

    // --- stamina ---
    const d = STAMINA.drain * dt;   // negative number
    const r = STAMINA.regen * dt;   // positive number
    this.stamina = this.sprinting
      ? Math.max(0, this.stamina + d)
      : Math.min(STAMINA.max, this.stamina + r);

    // --- state ---
    this.state = !this.moving ? PlayerState.IDLE
      : this.crouching ? PlayerState.CROUCH
      : this.sprinting ? PlayerState.SPRINT
      : PlayerState.WALK;

    // --- speed ---
    const base = this.sprinting ? SPEED.sprint
               : this.crouching ? SPEED.crouch
               : SPEED.walk;
    const speed = base * this.speedMul;

    // --- move in yaw space (forward = -Z at yaw 0) ---
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dx = (cos * axes.x + sin * axes.z) * speed * dt;
    const dz = (-sin * axes.x + cos * axes.z) * speed * dt;

    this.position.x += dx;
    this.position.z += dz;

    if (this.bounds) {
      const b = this.bounds;
      this.position.x = Math.min(b.maxX, Math.max(b.minX, this.position.x));
      this.position.z = Math.min(b.maxZ, Math.max(b.minZ, this.position.z));
    }

    this.velocity.set(dx / dt || 0, 0, dz / dt || 0);
    this.yaw = input.yaw;
    this.pitch = input.pitch;
  }

  damage(amount) {
    if (this.godmode || this.health <= 0) return this.health;
    this.health = Math.max(0, this.health - amount);
    return this.health;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    return this.health;
  }

  get alive() { return this.health > 0; }
}

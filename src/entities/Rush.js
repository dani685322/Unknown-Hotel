import { Chaser } from './Chaser.js';

export class Rush extends Chaser {
  constructor(options) {
    super({ ...options, type: 'rush', speed: 4.8, damage: 35 });
    this._speed = 0;
    this._dist = 0;
  }

  spawn() {
    this._speed = this.speed;
    this._dist = 0;
    return this;
  }

  update(dt, { hidden }) {
    if (hidden) return;
    const dx = this.player.position.x - this.group.position.x;
    const dz = this.player.position.z - this.group.position.z;
    this._dist = Math.hypot(dx, dz);
    this._speed = this._dist < 12 ? this.speed : this.speed * 0.55;
    this.speed = this._speed;
    super.update(dt);
  }
}

export default Rush;

import { Chaser } from './Chaser.js';

export class Ambush extends Chaser {
  constructor(options) {
    super({ ...options, type: 'ambush', speed: 2.1, damage: 24 });
    this.phase = 'stalk';
  }

  update(dt, { hidden, lampOn, hazardGrace }) {
    if (hazardGrace || hidden || this.player.hidden) {
      this.phase = 'waiting';
      return;
    }
    if (lampOn) {
      this.phase = 'retreat';
      return;
    }
    this.phase = 'stalk';
    super.update(dt, { hidden });
  }
}

export default Ambush;

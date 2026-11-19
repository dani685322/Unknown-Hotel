import { Chaser } from './Chaser.js';

export class Ambush extends Chaser {
  constructor(options) {
    super({ ...options, type: 'ambush', speed: 2.1, damage: 24 });
    this.phase = 'stalk';
  }

  update(dt, { lampOn }) {
    if (lampOn) {
      this.phase = 'retreat';
      return;
    }
    this.phase = 'stalk';
    super.update(dt);
  }
}

export default Ambush;

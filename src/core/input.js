// src/core/input.js — Phase 2: keyboard + pointer-lock mouse

export class Input {
  constructor(domElement) {
    this.dom = domElement;

    // movement flags
    this.keys = { forward: false, back: false, left: false, right: false };
    this.sprint = false;
    this.crouch = false;

    // one-shot actions (consumed by callers)
    this.interactPressed = false;
    this.usePressed = false;
    this.dropPressed = false;
    this.lampPressed = false;
    this.selectedSlot = 0;

    // mouse look
    this.yaw = 0;
    this.pitch = 0;
    this.sensitivity = 0.0022;
    this.locked = false;

    this._bind();
  }

  _bind() {
    document.addEventListener('keydown', (e) => this._onKey(e, true));
    document.addEventListener('keyup', (e) => this._onKey(e, false));

    this.dom.addEventListener('click', (event) => {
      if (!this.locked) this.dom.requestPointerLock();
      if (event.button === 0) this.usePressed = true;
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch));
    });
  }

  _onKey(e, down) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    this.keys.forward = down; break;
      case 'KeyS': case 'ArrowDown':  this.keys.back    = down; break;
      case 'KeyA': case 'ArrowLeft':  this.keys.left    = down; break;
      case 'KeyD': case 'ArrowRight': this.keys.right   = down; break;

      case 'ShiftLeft':   this.sprint = down; break;
      case 'ControlLeft': this.crouch = down; break;

      case 'KeyE': if (down) this.interactPressed = true; break;
      case 'KeyQ': if (down) this.usePressed = true; break;
      case 'KeyF': if (down) this.lampPressed = true; break;
      case 'Digit1': if (down) this.selectedSlot = 0; break;
      case 'Digit2': if (down) this.selectedSlot = 1; break;
      case 'Digit3': if (down) this.selectedSlot = 2; break;
      case 'Digit4': if (down) this.selectedSlot = 3; break;
      case 'Digit5': if (down) this.selectedSlot = 4; break;
      case 'Space':
        if (down) this.dropPressed = true;
        e.preventDefault();
        break;
    }
  }

  clearOneShots() {
    this.interactPressed = false;
    this.usePressed = false;
    this.dropPressed = false;
    this.lampPressed = false;
  }

  moveAxes() {
    let strafe = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    let forward = (this.keys.forward ? 1 : 0) - (this.keys.back ? 1 : 0);
    const length = Math.hypot(strafe, forward);
    if (length > 1) {
      strafe /= length;
      forward /= length;
    }
    return { strafe, forward };
  }
}

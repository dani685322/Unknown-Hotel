export class OptionsMenu {
  constructor({ game, renderer, onClose }) {
    this.game = game;
    this.renderer = renderer;
    this.onClose = onClose;
    this.root = document.createElement('section');
    this.root.className = 'opts';
    this.root.setAttribute('aria-label', 'Options');
    this.root.innerHTML = '<div class="opts__panel"><header class="opts__header"><span class="opts__eyebrow">HOTEL SERVICE</span><button class="opts__close" type="button" aria-label="Close options">×</button></header><h1>Options</h1><div class="opts__cols"><section class="col"><h2>Picture</h2><div class="panel"><label class="panel__label" for="opts-brightness">Brightness <output class="opts__value" data-value="brightness">0.90</output></label><input id="opts-brightness" class="opts__range" type="range" min="0.55" max="1.5" step="0.05" value="0.9"><div class="seg" role="group" aria-label="Brightness preset"><button type="button" data-preset="0.75">Dim</button><button type="button" data-preset="0.9" class="is-active">Hotel</button><button type="button" data-preset="1.2">Bright</button></div></div></section><section class="col"><h2>Controls</h2><div class="panel"><label class="panel__label" for="opts-sensitivity">Mouse sensitivity <output class="opts__value" data-value="sensitivity">0.0022</output></label><input id="opts-sensitivity" class="opts__range" type="range" min="0.001" max="0.005" step="0.0002" value="0.0022"><label class="chk"><input type="checkbox" data-setting="lamp" checked><span class="chk__box"></span><span>Start with lamp on</span></label></div></section></div><footer class="opts__footer"><span>Changes apply immediately.</span><button class="opts__back" type="button">Return</button></footer></div>';
    document.body.append(this.root);

    this.brightness = this.root.querySelector('#opts-brightness');
    this.sensitivity = this.root.querySelector('#opts-sensitivity');
    this.brightness.addEventListener('input', () => this._setBrightness(this.brightness.value));
    this.sensitivity.addEventListener('input', () => this._setSensitivity(this.sensitivity.value));
    this.root.querySelectorAll('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        this.brightness.value = button.dataset.preset;
        this._setBrightness(this.brightness.value);
        this.root.querySelectorAll('[data-preset]').forEach((item) => item.classList.toggle('is-active', item === button));
      });
    });
    this.root.querySelector('[data-setting="lamp"]').addEventListener('change', (event) => {
      this.game.player.lampState = event.currentTarget.checked ? 'on' : 'off';
    });
    this.root.querySelector('.opts__close').addEventListener('click', () => this.close());
    this.root.querySelector('.opts__back').addEventListener('click', () => this.close());
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.close();
    });
    this.root.hidden = true;
  }

  _setBrightness(value) {
    const brightness = Number(value);
    this.renderer.toneMappingExposure = brightness;
    this.root.querySelector('[data-value="brightness"]').value = brightness.toFixed(2);
    this.root.querySelector('[data-value="brightness"]').textContent = brightness.toFixed(2);
  }

  _setSensitivity(value) {
    const sensitivity = Number(value);
    this.game.input.sensitivity = sensitivity;
    this.root.querySelector('[data-value="sensitivity"]').value = sensitivity.toFixed(4);
    this.root.querySelector('[data-value="sensitivity"]').textContent = sensitivity.toFixed(4);
  }

  open() {
    this.root.hidden = false;
    this.root.classList.add('open');
    this.root.querySelector('.opts__back').focus();
  }

  close() {
    this.root.classList.remove('open');
    this.root.hidden = true;
    this.onClose?.();
  }

  destroy() {
    this.root.remove();
  }
}

export default OptionsMenu;

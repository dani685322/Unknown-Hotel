import * as THREE from 'three';

const MATERIAL_COLORS = {
  wood: '#73543a',
  stone: '#7d858b',
  brass: '#c7963f',
  fabric: '#526b73',
  glass: '#7fb5c8',
  concrete: '#92908a',
};

const EDITOR_LIMITS = {
  rooms: 100,
  meshes: 200,
  lights: 50,
  spawns: 8,
  doors: 50,
  triggers: 50,
  rules: 100,
};

const DEFAULT_SCENE = {
  template: 'corridor',
  rooms: [{ x: 0, y: 0, z: 0, width: 14, height: 4, depth: 20, material: 'wood' }],
  meshes: [],
  lights: [{ x: 0, y: 3, z: 0, color: '#ffc76b', intensity: 1.2, distance: 18 }],
  spawns: [{ x: 0, y: 0, z: 7 }],
  doors: [],
  triggers: [],
  rules: [],
  multiplayer: true,
  maxPlayers: 4,
};

export class SceneStudio {
  constructor(root, sceneValue, onChange, onError = () => {}) {
    this.root = root;
    this.onChange = onChange;
    this.onError = onError;
    this.sceneData = this.normalizeScene(sceneValue);
    this.selection = null;
    this.running = true;
    this.azimuth = Math.PI / 4;
    this.elevation = 0.62;
    this.distance = 28;
    this.renderShell();
    this.initializeRenderer();
    this.renderScene();
    this.renderObjectList();
    this.renderInspector();
    this.animate();
  }

  normalizeScene(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(DEFAULT_SCENE);
    const scene = structuredClone(DEFAULT_SCENE);
    for (const key of ['template', 'rooms', 'meshes', 'lights', 'spawns', 'doors', 'triggers', 'rules', 'multiplayer', 'maxPlayers']) {
      if (value[key] !== undefined) scene[key] = value[key];
    }
    for (const [type, limit] of Object.entries(EDITOR_LIMITS)) {
      if (!Array.isArray(scene[type])) scene[type] = [];
      else scene[type] = scene[type].filter((item) => item && typeof item === 'object' && !Array.isArray(item)).slice(0, limit);
    }
    return scene;
  }

  renderShell() {
    this.root.innerHTML = `<section class="studio-shell">
      <div class="studio-toolbar" aria-label="Add scene object">
        <button type="button" data-add="rooms">Room</button>
        <button type="button" data-add="meshes">Primitive</button>
        <button type="button" data-add="lights">Light</button>
        <button type="button" data-add="spawns">Spawn</button>
        <button type="button" data-add="doors">Door</button>
        <button type="button" data-add="triggers">Trigger</button>
        <button type="button" data-add="rules">Rule</button>
      </div>
      <div class="studio-layout">
        <div class="studio-viewport"><canvas aria-label="3D scene preview"></canvas><span>Drag to orbit · Scroll to zoom</span></div>
        <aside class="studio-inspector">
          <h2>Scene objects</h2>
          <div class="studio-object-list"></div>
          <div class="studio-properties"></div>
        </aside>
      </div>
    </section>`;
    this.canvas = this.root.querySelector('canvas');
    this.objectList = this.root.querySelector('.studio-object-list');
    this.inspector = this.root.querySelector('.studio-properties');
    this.root.querySelectorAll('[data-add]').forEach((button) => {
      button.addEventListener('click', () => this.addObject(button.dataset.add));
    });
  }

  initializeRenderer() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    } catch (error) {
      this.onError(`3D preview is unavailable: ${error.message}`);
      this.canvas.hidden = true;
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.canvas.clientWidth || 640, this.canvas.clientHeight || 360);
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#101620');
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight('#d9e8ff', '#25202a', 1.5));
    const keyLight = new THREE.DirectionalLight('#fff0d6', 2.2);
    keyLight.position.set(8, 16, 10);
    keyLight.castShadow = true;
    this.scene.add(keyLight);
    this.scene.add(new THREE.GridHelper(80, 40, '#46536a', '#283344'));
    this.objectGroup = new THREE.Group();
    this.scene.add(this.objectGroup);
    this.resizeHandler = () => this.resize();
    this.canvas.addEventListener('pointerdown', this.onPointerDown = (event) => {
      this.dragOrigin = { x: event.clientX, y: event.clientY, azimuth: this.azimuth, elevation: this.elevation };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', this.onPointerMove = (event) => {
      if (!this.dragOrigin) return;
      this.azimuth = this.dragOrigin.azimuth - (event.clientX - this.dragOrigin.x) * 0.008;
      this.elevation = Math.max(0.15, Math.min(1.35, this.dragOrigin.elevation + (event.clientY - this.dragOrigin.y) * 0.006));
      this.updateCamera();
    });
    this.canvas.addEventListener('pointerup', this.onPointerUp = () => { this.dragOrigin = null; });
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel = (event) => {
      event.preventDefault();
      this.distance = Math.max(10, Math.min(70, this.distance + event.deltaY * 0.025));
      this.updateCamera();
    }, { passive: false });
    window.addEventListener('resize', this.resizeHandler);
    this.resize();
    this.updateCamera();
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  updateCamera() {
    if (!this.camera) return;
    const target = new THREE.Vector3(0, 1.5, 0);
    this.camera.position.set(
      target.x + this.distance * Math.sin(this.azimuth) * Math.cos(this.elevation),
      target.y + this.distance * Math.sin(this.elevation),
      target.z + this.distance * Math.cos(this.azimuth) * Math.cos(this.elevation),
    );
    this.camera.lookAt(target);
  }

  makeMaterial(material = 'wood', transparent = false) {
    return new THREE.MeshStandardMaterial({
      color: MATERIAL_COLORS[material] ?? MATERIAL_COLORS.wood,
      roughness: material === 'glass' ? 0.28 : 0.78,
      metalness: material === 'brass' ? 0.65 : 0.05,
      transparent,
      opacity: transparent ? 0.28 : 1,
    });
  }

  addBox(parent, x, y, z, width, height, depth, material, transparent = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), this.makeMaterial(material, transparent));
    mesh.position.set(x, y, z);
    mesh.castShadow = !transparent;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  clearObjectGroup() {
    if (!this.objectGroup) return;
    this.objectGroup.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose();
    });
    this.objectGroup.clear();
  }

  renderScene() {
    if (!this.objectGroup) return;
    this.clearObjectGroup();
    const scene = this.sceneData;
    scene.rooms.forEach((room) => {
      const { x, y, z, width, height, depth, material } = room;
      this.addBox(this.objectGroup, x, y - 0.08, z, width, 0.16, depth, material);
      this.addBox(this.objectGroup, x, y + height / 2, z - depth / 2, width, height, 0.18, material);
      this.addBox(this.objectGroup, x - width / 2, y + height / 2, z, 0.18, height, depth, material);
      this.addBox(this.objectGroup, x + width / 2, y + height / 2, z, 0.18, height, depth, material);
    });
    scene.meshes.forEach((mesh) => this.addBox(this.objectGroup, mesh.x, mesh.y + mesh.height / 2, mesh.z, mesh.width, mesh.height, mesh.depth, mesh.material));
    scene.doors.forEach((door) => this.addBox(this.objectGroup, door.x, door.y + door.height / 2, door.z, door.width, door.height, door.depth, door.material));
    scene.triggers.forEach((trigger) => this.addBox(this.objectGroup, trigger.x, trigger.y + trigger.height / 2, trigger.z, trigger.width, trigger.height, trigger.depth, 'glass', true));
    scene.spawns.forEach((spawn) => {
      const marker = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 4), new THREE.MeshStandardMaterial({ color: '#7ee3b0', emissive: '#235c46' }));
      marker.position.set(spawn.x, spawn.y + 0.5, spawn.z);
      marker.castShadow = true;
      this.objectGroup.add(marker);
    });
    scene.lights.forEach((light) => {
      const color = light.color ?? '#ffc76b';
      const point = new THREE.PointLight(color, light.intensity ?? 1, light.distance ?? 12);
      point.position.set(light.x, light.y, light.z);
      this.objectGroup.add(point);
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color }));
      marker.position.copy(point.position);
      this.objectGroup.add(marker);
    });
    this.renderer?.render(this.scene, this.camera);
  }

  animate() {
    if (!this.running || !this.renderer) return;
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  addObject(type) {
    const items = this.sceneData[type];
    if (!Array.isArray(items) || items.length >= EDITOR_LIMITS[type]) {
      this.onError(`The scene cannot contain more than ${EDITOR_LIMITS[type] ?? 100} ${type}.`);
      return;
    }
    const defaults = {
      rooms: { x: 0, y: 0, z: 0, width: 14, height: 4, depth: 20, material: 'wood' },
      meshes: { x: 2, y: 0, z: 0, width: 2, height: 2, depth: 2, material: 'brass' },
      lights: { x: 0, y: 3, z: 0, color: '#ffc76b', intensity: 1, distance: 12 },
      spawns: { x: 0, y: 0, z: 6 },
      doors: { x: 0, y: 0, z: -8, width: 2.4, height: 3.2, depth: 0.35, material: 'wood', locked: false },
      triggers: { x: 0, y: 0, z: -5, width: 3, height: 2, depth: 2, action: 'open-door' },
      rules: { event: 'interact', action: 'open-door', value: '' },
    };
    const item = structuredClone(defaults[type]);
    items.push(item);
    this.selection = { type, index: items.length - 1 };
    this.changed();
  }

  selectedItem() {
    if (!this.selection) return null;
    return this.sceneData[this.selection.type]?.[this.selection.index] ?? null;
  }

  renderObjectList() {
    const rows = Object.entries(EDITOR_LIMITS).flatMap(([type]) => (this.sceneData[type] ?? []).map((item, index) => ({ type, index, item })));
    this.objectList.innerHTML = rows.length ? '' : '<p class="studio-empty">Add a room or object to start building.</p>';
    rows.forEach(({ type, index, item }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = this.selection?.type === type && this.selection.index === index ? 'selected' : '';
      const label = { rooms: 'Room', meshes: 'Primitive', lights: 'Light', spawns: 'Spawn', doors: 'Door', triggers: 'Trigger', rules: 'Rule' }[type];
      button.textContent = `${label} ${index + 1}`;
      button.addEventListener('click', () => {
        this.selection = { type, index };
        this.renderObjectList();
        this.renderInspector();
      });
      this.objectList.append(button);
    });
  }

  createField(label, key, value, options = {}) {
    const wrapper = document.createElement('label');
    wrapper.className = 'studio-field';
    const caption = document.createElement('span');
    caption.textContent = label;
    wrapper.append(caption);
    let input;
    if (options.values) {
      input = document.createElement('select');
      options.values.forEach((optionValue) => {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue;
        input.append(option);
      });
    } else if (options.boolean) {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = value;
    } else {
      input = document.createElement('input');
      input.type = options.text ? 'text' : 'number';
      input.step = '0.1';
      input.min = '-100';
      input.max = '100';
      if (!options.text) input.value = Number(value ?? 0);
      else input.value = String(value ?? '');
    }
    if (options.values) input.value = value;
    input.addEventListener('change', () => {
      const selected = this.selectedItem();
      if (!selected) return;
      selected[key] = options.boolean ? input.checked : options.values || options.text ? input.value : Number(input.value);
      this.changed();
    });
    wrapper.append(input);
    return wrapper;
  }

  renderInspector() {
    const item = this.selectedItem();
    this.inspector.innerHTML = '';
    if (!item || !this.selection) return;
    const title = document.createElement('h3');
    const label = { rooms: 'Room', meshes: 'Primitive', lights: 'Light', spawns: 'Spawn', doors: 'Door', triggers: 'Trigger', rules: 'Rule' }[this.selection.type];
    title.textContent = `${label} properties`;
    this.inspector.append(title);
    const fields = this.inspector;
    if (this.selection.type === 'rules') {
      fields.append(this.createField('Event', 'event', item.event, { values: ['enter', 'interact', 'collect', 'timer'] }));
      fields.append(this.createField('Action', 'action', item.action, { values: ['open-door', 'show-message', 'complete', 'toggle-light'] }));
      fields.append(this.createField('Value', 'value', item.value, { text: true }));
    } else {
      ['x', 'y', 'z'].forEach((key) => fields.append(this.createField(key.toUpperCase(), key, item[key])));
      if (this.selection.type !== 'spawns' && this.selection.type !== 'lights') {
        ['width', 'height', 'depth'].forEach((key) => fields.append(this.createField(key, key, item[key])));
      }
      if (['rooms', 'meshes', 'doors'].includes(this.selection.type)) {
        fields.append(this.createField('Material', 'material', item.material, { values: Object.keys(MATERIAL_COLORS) }));
      }
      if (this.selection.type === 'doors') fields.append(this.createField('Locked', 'locked', item.locked, { boolean: true }));
      if (this.selection.type === 'lights') {
        fields.append(this.createField('Intensity', 'intensity', item.intensity));
        fields.append(this.createField('Range', 'distance', item.distance));
        fields.append(this.createField('Color', 'color', item.color, { text: true }));
      }
      if (this.selection.type === 'triggers') fields.append(this.createField('Action', 'action', item.action, { values: ['open-door', 'show-message', 'complete', 'toggle-light'] }));
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'studio-remove';
    remove.textContent = 'Remove selected';
    remove.addEventListener('click', () => {
      this.sceneData[this.selection.type].splice(this.selection.index, 1);
      this.selection = null;
      this.changed();
    });
    fields.append(remove);
  }

  changed() {
    this.renderScene();
    this.renderObjectList();
    this.renderInspector();
    this.onChange(structuredClone(this.sceneData));
  }

  setScene(value) {
    this.sceneData = this.normalizeScene(value);
    this.selection = null;
    this.changed();
  }

  serialize() {
    return structuredClone(this.sceneData);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.resizeHandler);
    if (this.renderer) {
      this.clearObjectGroup();
      this.renderer.dispose();
    }
  }
}

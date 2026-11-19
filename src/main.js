// src/main.js — Phases 1-3: corridor, look/input, player movement
import * as THREE from 'three';
import { Input } from './core/input.js';
import { Player } from './player/Player.js';

const app = document.getElementById('app');
const hud = document.getElementById('hud');

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
app.appendChild(renderer.domElement);

// ------------------------------------------------------------------- scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.Fog(0x05060a, 8, 34);

// ------------------------------------------------------------------ camera
const FOV = 72;
const camera = new THREE.PerspectiveCamera(
  FOV, window.innerWidth / window.innerHeight, 0.05, 200
);
camera.rotation.order = 'YXZ';
camera.position.set(0, 1.65, 8);

// ------------------------------------------------------------------ lights
scene.add(new THREE.AmbientLight(0x6a6a7a, 0.6));
scene.add(new THREE.HemisphereLight(0x8fa2c0, 0x0c0c10, 0.5));

// --------------------------------------------------------------- corridor
const W = 4;      // width
const H = 3;      // height
const L = 44;     // length, centered on origin
const Z0 = -L / 2;
const Z1 = L / 2;

const floorMat = new THREE.MeshStandardMaterial({ color: 0x2f2b27, roughness: 0.92 });
const wallMat  = new THREE.MeshStandardMaterial({ color: 0x7d7568, roughness: 0.95 });
const ceilMat  = new THREE.MeshStandardMaterial({ color: 0x1b1917, roughness: 1.0 });

// floor + ceiling
const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, L), ceilMat);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = H;
scene.add(ceiling);

// side walls
for (const side of [-1, 1]) {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(L, H), wallMat);
  wall.rotation.y = side * Math.PI / 2;
  wall.position.set((side * W) / 2, H / 2, 0);
  scene.add(wall);
}

// far end caps
for (const z of [Z0, Z1]) {
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat);
  cap.position.set(0, H / 2, z);
  if (z === Z1) cap.rotation.y = Math.PI;
  scene.add(cap);
}

// ------------------------------------------------------------------ lamps
// Three.js r155+ uses physical light units -> intensity is large (candela).
const lamps = [];
const LAMP_Z = [14, 4, -6, -16];

for (const z of LAMP_Z) {
  const base = 22;

  const light = new THREE.PointLight(0xffe6b0, base, 26, 1.7);
  light.position.set(0, H - 0.25, z);
  scene.add(light);

  // visible fixture
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffe6b0, emissiveIntensity: 2 })
  );
  bulb.position.copy(light.position);
  scene.add(bulb);

  lamps.push({ light, bulb, base, seed: Math.random() * 100 });
}

// ----------------------------------------------------------------- player
const input = new Input(renderer.domElement);

const player = new Player({ x: 0, z: 14 });
player.setBounds({ minX: -W / 2 + 0.35, maxX: W / 2 - 0.35, minZ: Z0 + 0.4, maxZ: Z1 - 0.4 });

// ------------------------------------------------------------------- loop
const clock = new THREE.Clock();

function flicker(now) {
  for (const l of lamps) {
    const s = l.seed;
    const noise =
      Math.sin(now * 0.004 + s) * 0.05 +
      Math.sin(now * 0.017 + s * 3.1) * 0.03;
    const v = l.base * (1 + noise);
    l.light.intensity = Math.max(0.5, v);
    l.bulb.material.emissiveIntensity = 1.6 + noise * 6;
  }
}

function updateHUD() {
  const pct = Math.round((player.stamina / player.maxHealth) * 100);
  hud.textContent = input.locked
    ? `HP ${player.health} | Stan ${Math.round(player.stamina)}% | ${player.state}`
    : 'Click to lock mouse';
  hud.style.opacity = pct >= 0 ? '1' : '1';
}

function tick() {
  requestAnimationFrame(tick);

  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();

  player.update(dt, input);

  camera.position.copy(player.eyePosition);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');

  flicker(now);
  updateHUD();
  input.clearOneShots();

  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- resizing
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

tick();

export { scene, camera, renderer, input, player };

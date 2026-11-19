// src/main.js — renderer and runtime bootstrap
import * as THREE from 'three';
import { Input } from './core/input.js';
import { Player } from './player/Player.js';
import { Run } from './game/Run.js';

const app = document.getElementById('app');
const hud = document.getElementById('hud');

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.55;
app.appendChild(renderer.domElement);

// ------------------------------------------------------------------- scene
const scene = new THREE.Scene();

// ------------------------------------------------------------------ camera
const FOV = 72;
const camera = new THREE.PerspectiveCamera(
  FOV, window.innerWidth / window.innerHeight, 0.05, 200
);
camera.rotation.order = 'YXZ';
camera.position.set(0, 1.65, 8);

// ----------------------------------------------------------------- player
const input = new Input(renderer.domElement);
const player = new Player();
const game = new Run({
  scene,
  renderer,
  input,
  player,
  hud,
  prompt: document.getElementById('prompt'),
  reticle: document.getElementById('reticle'),
});

// ------------------------------------------------------------------- loop
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);

  const dt = Math.min(clock.getDelta(), 0.1);
  game.update(dt);

  camera.position.copy(player.eyePosition);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');

  game.updateHUD();
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

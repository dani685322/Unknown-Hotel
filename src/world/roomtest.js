// src/world/roomtest.js — Phase 6 preview: one room + its door, click to interact
import * as THREE from 'three';
import { generateRun } from './roomGen.js';
import { Room } from './Room.js';
import { Door } from './Door.js';

const app = document.getElementById('app');
const hud = document.getElementById('hud');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.Fog(0x05060a, 10, 40);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 200);

const params = new URLSearchParams(location.search);
const wanted = Math.min(100, Math.max(1, Number(params.get('room') ?? 1)));
const seed = Number(params.get('seed') ?? 20260419);

const run = generateRun(seed);
const desc = run.get(wanted);

const room = new Room(desc);
scene.add(room.group);

const door = Door.forRoom(room);

scene.add(new THREE.AmbientLight(0x8890a0, 0.4));

// stand near the entry wall, looking down the room at the door
camera.position.set(0, 1.6, room.length / 2 - 1.2);
camera.rotation.set(0, 0, 0, 'YXZ');

const inventory = { keys: 3 };
let flash = '';

function updateHUD(extra = '') {
  hud.innerHTML =
    `${desc.label} · ${desc.archetype} · ${desc.width}x${desc.length} · ` +
    `lit=${desc.lit} · lock=${door.lock.type} · spots=${room.hidingSpots.length}<br>` +
    `<span style="color:#c9d4e0">click to interact</span> · ` +
    `door=${door.state} · keys=${inventory.keys}` +
    (extra ? `<br><span style="color:#ffb86b">${extra}</span>` : '');
}
updateHUD();

const canvas = renderer.domElement;

canvas.addEventListener('click', async () => {
  // a code door opens its keypad on first click, then retries with the right code
  if (door.lock.type === 'code' && !door.isOpen) {
    const wrong = door.tryCode('0000');
    if (!door.isOpen) {
      const right = door.tryCode(desc.lock.code);
      flash = `${wrong.message} → ${right.message}`;
      updateHUD(flash);
      return;
    }
  }

  const res = door.interact(inventory);
  if (res.consumesKey) inventory.keys -= 1;
  flash = res.message;
  updateHUD(flash);
});

const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.1);

  door.update(dt);
  room.update(performance.now());

  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

tick();

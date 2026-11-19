import * as THREE from 'three';

const TEXTURE_SIZE = 512;
const SURFACES = {
  wall: { base: '#85735f', shade: '#342820', roughness: 218 },
  floor: { base: '#68452f', shade: '#24170f', roughness: 190 },
  ceiling: { base: '#493b30', shade: '#17120f', roughness: 232 },
  trim: { base: '#493323', shade: '#1d120d', roughness: 178 },
  wood: { base: '#705039', shade: '#28190f', roughness: 198 },
  cloth: { base: '#45413a', shade: '#181614', roughness: 238 },
  metal: { base: '#625347', shade: '#26150e', roughness: 142 },
};

function randomSource(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvases(kind, spec) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = heightCanvas.height = TEXTURE_SIZE;
  const heightContext = heightCanvas.getContext('2d');
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = roughCanvas.height = TEXTURE_SIZE;
  const roughContext = roughCanvas.getContext('2d');
  const rand = randomSource(kind.length * 971 + 61);

  context.fillStyle = spec.base;
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  heightContext.fillStyle = '#808080';
  heightContext.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  roughContext.fillStyle = `rgb(${spec.roughness}, ${spec.roughness}, ${spec.roughness})`;
  roughContext.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  if (kind === 'wall') {
    for (let x = 0; x < TEXTURE_SIZE; x += 64) {
      context.fillStyle = 'rgba(32, 23, 16, .12)';
      context.fillRect(x, 0, 4, TEXTURE_SIZE);
      heightContext.fillStyle = '#a0a0a0';
      heightContext.fillRect(x, 0, 3, TEXTURE_SIZE);
    }
    for (let i = 0; i < 44; i++) {
      const x = rand() * TEXTURE_SIZE;
      const y = rand() * TEXTURE_SIZE;
      const radius = 12 + rand() * 65;
      const gradient = context.createRadialGradient(x, y, 2, x, y, radius);
      gradient.addColorStop(0, 'rgba(31, 21, 14, .3)');
      gradient.addColorStop(1, 'rgba(31, 21, 14, 0)');
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      roughContext.fillStyle = 'rgb(72, 72, 72)';
      roughContext.beginPath();
      roughContext.ellipse(x, y, radius * 0.7, radius, rand() * Math.PI, 0, Math.PI * 2);
      roughContext.fill();
      heightContext.fillStyle = 'rgba(48, 48, 48, .3)';
      heightContext.beginPath();
      heightContext.ellipse(x, y, radius * 0.7, radius, rand() * Math.PI, 0, Math.PI * 2);
      heightContext.fill();
    }
    for (let i = 0; i < 8; i++) {
      const x = rand() * TEXTURE_SIZE;
      const y = rand() * TEXTURE_SIZE;
      context.fillStyle = 'rgba(199, 177, 143, .72)';
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + 9 + rand() * 19, y + 3);
      context.lineTo(x + 3 + rand() * 10, y + 22 + rand() * 37);
      context.lineTo(x - 2, y + 14);
      context.closePath();
      context.fill();
      heightContext.fillStyle = '#c9c9c9';
      heightContext.fill();
    }
  } else if (kind === 'floor') {
    for (let row = 0; row < 8; row++) {
      const y = row * 64;
      const offset = row % 2 ? 80 : 0;
      context.fillStyle = row % 2 ? 'rgba(201, 147, 92, .1)' : 'rgba(19, 11, 6, .1)';
      context.fillRect(0, y, TEXTURE_SIZE, 64);
      context.strokeStyle = 'rgba(16, 10, 7, .8)';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, y + 63);
      context.lineTo(TEXTURE_SIZE, y + 63);
      context.stroke();
      for (let x = offset; x < TEXTURE_SIZE; x += 160) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + 64);
        context.stroke();
      }
      for (let grain = 0; grain < 9; grain++) {
        const gx = rand() * TEXTURE_SIZE;
        context.strokeStyle = `rgba(218, 172, 119, ${0.025 + rand() * 0.07})`;
        context.lineWidth = 1 + rand() * 2;
        context.beginPath();
        context.moveTo(gx, y + rand() * 45);
        context.bezierCurveTo(gx + 45, y + 5, gx + 80, y + 56, gx + 140, y + 20 + rand() * 35);
        context.stroke();
      }
    }
    heightContext.strokeStyle = '#555555';
    heightContext.lineWidth = 4;
    for (let y = 64; y < TEXTURE_SIZE; y += 64) {
      heightContext.beginPath();
      heightContext.moveTo(0, y);
      heightContext.lineTo(TEXTURE_SIZE, y);
      heightContext.stroke();
    }
  } else if (kind === 'ceiling') {
    for (let i = 0; i < 35; i++) {
      const x = rand() * TEXTURE_SIZE;
      const y = rand() * TEXTURE_SIZE;
      const radius = 15 + rand() * 90;
      const gradient = context.createRadialGradient(x, y, 1, x, y, radius);
      gradient.addColorStop(0, 'rgba(13, 9, 6, .48)');
      gradient.addColorStop(1, 'rgba(13, 9, 6, 0)');
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      roughContext.fillStyle = 'rgb(84, 84, 84)';
      roughContext.beginPath();
      roughContext.ellipse(x, y, radius, radius * 0.55, rand(), 0, Math.PI * 2);
      roughContext.fill();
    }
    context.strokeStyle = 'rgba(16, 11, 8, .36)';
    context.lineWidth = 3;
    context.strokeRect(2, 2, 508, 508);
  } else if (kind === 'metal') {
    for (let i = 0; i < 120; i++) {
      const x = rand() * TEXTURE_SIZE;
      const y = rand() * TEXTURE_SIZE;
      context.strokeStyle = `rgba(19, 12, 9, ${0.12 + rand() * 0.38})`;
      context.lineWidth = 1 + rand() * 3;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + rand() * 22, y + 2 + rand() * 12);
      context.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const x = rand() * TEXTURE_SIZE;
      const y = rand() * TEXTURE_SIZE;
      context.fillStyle = 'rgba(133, 57, 28, .3)';
      context.beginPath();
      context.arc(x, y, 3 + rand() * 18, 0, Math.PI * 2);
      context.fill();
      roughContext.fillStyle = 'rgb(91, 91, 91)';
      roughContext.beginPath();
      roughContext.arc(x, y, 3 + rand() * 18, 0, Math.PI * 2);
      roughContext.fill();
    }
  } else {
    for (let i = 0; i < 100; i++) {
      const x = rand() * TEXTURE_SIZE;
      const y = rand() * TEXTURE_SIZE;
      context.strokeStyle = `rgba(245, 220, 184, ${rand() * 0.08})`;
      context.lineWidth = 1 + rand() * 2;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + rand() * 120, y + rand() * 12 - 6);
      context.stroke();
    }
  }

  return { canvas, heightCanvas, roughCanvas };
}

function normalCanvas(heightCanvas) {
  const context = heightCanvas.getContext('2d', { willReadFrequently: true });
  const source = context.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE).data;
  const output = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const sample = (x, y) => source[(y * TEXTURE_SIZE + x) * 4];
  for (let y = 1; y < TEXTURE_SIZE - 1; y++) {
    for (let x = 1; x < TEXTURE_SIZE - 1; x++) {
      const offset = (y * TEXTURE_SIZE + x) * 4;
      const dx = (sample(x - 1, y) - sample(x + 1, y)) / 255;
      const dy = (sample(x, y - 1) - sample(x, y + 1)) / 255;
      const normal = new THREE.Vector3(dx * 2.2, dy * 2.2, 1).normalize();
      output.data[offset] = Math.round((normal.x * 0.5 + 0.5) * 255);
      output.data[offset + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      output.data[offset + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      output.data[offset + 3] = 255;
    }
  }
  context.putImageData(output, 0, 0);
  return heightCanvas;
}

function makeTexture(canvas, color = false) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const SHARED_TEXTURES = Object.fromEntries(Object.entries(SURFACES).map(([kind, spec]) => {
  const canvases = makeCanvases(kind, spec);
  return [kind, {
    map: makeTexture(canvases.canvas, true),
    normalMap: makeTexture(normalCanvas(canvases.heightCanvas)),
    roughnessMap: makeTexture(canvases.roughCanvas),
  }];
}));

const MATERIAL_OPTIONS = {
  wall: { roughness: 0.9, metalness: 0.02 },
  floor: { roughness: 0.82, metalness: 0.04 },
  ceiling: { roughness: 0.96, metalness: 0 },
  trim: { roughness: 0.72, metalness: 0.02 },
  wood: { roughness: 0.82, metalness: 0 },
  cloth: { roughness: 0.95, metalness: 0 },
  metal: { roughness: 0.62, metalness: 0.5 },
};

export function createRoomMaterials({ width, length, height }) {
  const repeatByKind = {
    wall: [width / 2, length / 4],
    floor: [width / 2.5, length / 2.5],
    ceiling: [width / 3, length / 3],
    trim: [width / 2, length / 3],
    wood: [2, 2],
    cloth: [2, 2],
    metal: [2, 2],
  };
  const materials = {};
  for (const [kind, shared] of Object.entries(SHARED_TEXTURES)) {
    const [repeatX, repeatY] = repeatByKind[kind] ?? [1, 1];
    const map = shared.map.clone();
    const normalMap = shared.normalMap.clone();
    const roughnessMap = shared.roughnessMap.clone();
    for (const texture of [map, normalMap, roughnessMap]) texture.repeat.set(repeatX, repeatY);
    materials[kind] = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      ...MATERIAL_OPTIONS[kind],
      map,
      normalMap,
      roughnessMap,
      normalScale: new THREE.Vector2(kind === 'wall' ? 0.38 : 0.22, kind === 'wall' ? 0.38 : 0.22),
    });
  }
  materials.foliage = new THREE.MeshStandardMaterial({ color: 0x2c5a35, roughness: 0.9 });
  materials.bulb = new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffe6b0, emissiveIntensity: 2 });
  return materials;
}
*** End Patch
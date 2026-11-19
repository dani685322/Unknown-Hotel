// src/world/Room.js — Phase 5: geometry builder for one generated room descriptor
import * as THREE from 'three';
import { mulberry32 } from './roomGen.js';

// Door opening, shared with Door.js later
export const DOOR = { width: 1.15, height: 2.25, thickness: 0.18 };

const MAT = {
  floor:   new THREE.MeshStandardMaterial({ color: 0x2f2b27, roughness: 0.95 }),
  wall:    new THREE.MeshStandardMaterial({ color: 0x6f6a5e, roughness: 0.90 }),
  trim:    new THREE.MeshStandardMaterial({ color: 0x3a332b, roughness: 0.80 }),
  ceil:    new THREE.MeshStandardMaterial({ color: 0x1b1917, roughness: 1.00 }),
  wood:    new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.85 }),
  cloth:   new THREE.MeshStandardMaterial({ color: 0x2b3240, roughness: 1.00 }),
  metal:   new THREE.MeshStandardMaterial({ color: 0x8a8f99, metalness: 0.7, roughness: 0.4 }),
  foliage: new THREE.MeshStandardMaterial({ color: 0x2c5a35, roughness: 0.90 }),
  bulb:    new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffe6b0, emissiveIntensity: 2 }),
};

// local space: x in [-w/2, w/2], z in [-L/2, L/2]
// entry (back wall) at +z, exit doorway at -z  ->  player walks toward -z
export class Room {
  constructor(desc) {
    this.desc = desc;
    this.rand = mulberry32(desc.seedOffset);

    this.group = new THREE.Group();
    this.group.name = desc.label;

    this.lights = [];
    this.colliders = [];   // { minX, maxX, minZ, maxZ }
    this.hidingSpots = []; // { x, z, facing }

    this._build();
  }

  get width()  { return this.desc.width; }
  get length() { return this.desc.length; }
  get height() { return this.desc.height; }

  get entry() { return new THREE.Vector3(0, 0,  this.length / 2); }
  get exit()  { return new THREE.Vector3(0, 0, -this.length / 2); }

  getBounds() {
    return {
      minX: -this.width / 2 + 0.35,
      maxX:  this.width / 2 - 0.35,
      minZ: -this.length / 2 + 0.35,
      maxZ:  this.length / 2 - 0.35,
    };
  }

  /* ------------------------------------------------------------ helpers */
  _box(w, h, d, mat) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  }

  _add(mesh, x, y, z, solid = false) {
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    if (solid) this._collide(mesh, w(mesh), d(mesh));
    return mesh;
  }

  _collide(mesh, w, d) {
    this.colliders.push({
      minX: mesh.position.x - w / 2,
      maxX: mesh.position.x + w / 2,
      minZ: mesh.position.z - d / 2,
      maxZ: mesh.position.z + d / 2,
    });
  }

  _lamp(x, z, base, flicker = true) {
    const light = new THREE.PointLight(0xffe6b0, base, 26, 1.7);
    light.position.set(x, this.height - 0.25, z);
    this.group.add(light);

    const bulb = this._box(0.16, 0.06, 0.16, MAT.bulb);
    bulb.position.set(x, this.height - 0.12, z);
    this.group.add(bulb);

    this.lights.push({ light, bulb, base, flicker, seed: this.rand() * 100 });
  }

  // wall spanning x, containing the exit doorway (local -z end)
  _doorWall(z, facing) {
    const w = this.width, h = this.height;
    const side = (w - DOOR.width) / 2;

    for (const s of [-1, 1]) {
      const panel = this._box(side, h, DOOR.thickness, MAT.wall);
      panel.position.set(s * (DOOR.width / 2 + side / 2), h / 2, z);
      this.group.add(panel);
    }
    const header = this._box(DOOR.width, h - DOOR.height, DOOR.thickness, MAT.wall);
    header.position.set(0, DOOR.height + (h - DOOR.height) / 2, z);
    this.group.add(header);

    const frameMat = MAT.trim;
    for (const s of [-1, 1]) {
      const jamb = this._box(0.07, DOOR.height, DOOR.thickness + 0.05, frameMat);
      jamb.position.set(s * (DOOR.width / 2 + 0.035), DOOR.height / 2, z);
      this.group.add(jamb);
    }
    const lintel = this._box(DOOR.width, 0.07, DOOR.thickness + 0.05, frameMat);
    lintel.position.set(0, DOOR.height + 0.035, z);
    this.group.add(lintel);
    void facing;
  }

  _closet(x, z, facing) {
    const w = 1.1, h = 2.05, d = 0.6;
    const body = this._box(w, h, d, MAT.wood);
    body.position.set(x, h / 2, z);
    this.group.add(body);
    this._collide(body, w, d);

    const door = this._box(w * 0.92, h * 0.92, 0.04, MAT.trim);
    door.position.set(x, h / 2, z + facing * (d / 2 + 0.03));
    this.group.add(door);

    this.hidingSpots.push({ x, z, facing, roomIndex: this.desc.index });
  }

  /* -------------------------------------------------------------- build */
  _build() {
    const { width: w, length: L, height: h, archetype } = this.desc;
    const rand = this.rand;

    // floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, L), MAT.floor);
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // ceiling (garden: raised, with an open skylight strip)
    if (archetype === 'garden') {
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, L), MAT.ceil);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.y = h;
      this.group.add(ceil);
    } else {
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, L), MAT.ceil);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.y = h;
      this.group.add(ceil);
    }

    // side walls
    for (const s of [-1, 1]) {
      const wall = this._box(0.18, h, L, MAT.wall);
      wall.position.set((s * w) / 2, h / 2, 0);
      this.group.add(wall);
      this.colliders.push({
        minX: (s * w) / 2 - 0.1, maxX: (s * w) / 2 + 0.1,
        minZ: -L / 2, maxZ: L / 2,
      });
    }

    // back wall (solid), front wall (doorway)
    const back = this._box(w, h, 0.18, MAT.wall);
    back.position.set(0, h / 2, L / 2);
    this.group.add(back);

    this._doorWall(-L / 2 + 0.09);

    // skirting
    for (const s of [-1, 1]) {
      const sk = this._box(0.06, 0.12, L, MAT.trim);
      sk.position.set(s * (w / 2 - 0.1), 0.06, 0);
      this.group.add(sk);
    }

    /* ---------------------------------------------------------- lighting */
    const lampCount = Math.max(1, Math.round(L / 11));
    for (let i = 0; i < lampCount; i++) {
      if (!this.desc.lit && rand() > 0.15) continue; // dark room: mostly dead
      const z = -L / 2 + ((i + 0.5) / lampCount) * L;
      this._lamp(0, z, archetype === 'garden' ? 40 : 22, rand() > 0.25);
    }

    /* ------------------------------------------------------------ hiding */
    const spotCount = this.desc.hidingSpots;
    for (let i = 0; i < spotCount; i++) {
      const s = i % 2 === 0 ? -1 : 1;
      const z = -L / 2 + ((i + 1) / (spotCount + 1)) * L;
      this._closet(s * (w / 2 - 0.32), z, -s);
    }

    /* ------------------------------------------------------------- props */
    this._props(archetype, rand);
  }

  _props(archetype, rand) {
    const { width: w, length: L } = this.desc;
    const innerX = w / 2 - 0.9;

    const scatter = (n, fn) => {
      for (let i = 0; i < n; i++) {
        const x = (rand() * 2 - 1) * innerX;
        const z = (rand() * 2 - 1) * (L / 2 - 1.2);
        fn(x, z);
      }
    };

    switch (archetype) {
      case 'suite': {
        scatter(3, (x, z) => {
          const t = this._box(1.4, 0.75, 0.8, MAT.wood);
          t.position.set(x, 0.375, z);
          this.group.add(t);
          this._collide(t, 1.4, 0.8);
        });
        scatter(2, (x, z) => {
          const b = this._box(1.9, 0.5, 1.1, MAT.cloth);
          b.position.set(x, 0.25, z);
          this.group.add(b);
        });
        break;
      }
      case 'blackout': {
        scatter(6, (x, z) => {
          const d = this._box(0.35, 0.25, 0.5, MAT.trim);
          d.position.set(x, 0.125, z);
          d.rotation.y = rand() * Math.PI;
          this.group.add(d);
        });
        break;
      }
      case 'closet_gauntlet': {
        // extra closets beyond the guaranteed ones
        scatter(2, (x, z) => this._closet(x, z, x > 0 ? -1 : 1));
        break;
      }
      case 'figure_lair': {
        // pillars, low light
        for (let i = 0; i < 4; i++) {
          const x = (i % 2 === 0 ? -1 : 1) * (w / 2 - 1.6);
          const z = -L / 2 + ((i + 1) / 5) * L;
          const p = this._box(0.5, this.height, 0.5, MAT.trim);
          p.position.set(x, this.height / 2, z);
          this.group.add(p);
          this._collide(p, 0.5, 0.5);
        }
        break;
      }
      case 'garden': {
        scatter(7, (x, z) => {
          const pot = this._box(1.0, 0.6, 1.0, MAT.trim);
          pot.position.set(x, 0.3, z);
          this.group.add(pot);
          const bush = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), MAT.foliage);
          bush.position.set(x, 1.1, z);
          bush.scale.y = 0.8;
          this.group.add(bush);
        });
        const shaft = new THREE.PointLight(0xbfe6ff, 60, 40, 1.6);
        shaft.position.set(0, this.height - 0.4, 0);
        this.group.add(shaft);
        this.lights.push({ light: shaft, base: 60, flicker: false, seed: 0, bulb: null });
        break;
      }
      default: {
        scatter(2, (x, z) => {
          const c = this._box(0.6, 0.9, 0.6, MAT.wood);
          c.position.set(x, 0.45, z);
          this.group.add(c);
        });
      }
    }
  }

  /* ------------------------------------------------------------ runtime */
  update(t) {
    for (const l of this.lights) {
      if (!l.flicker) continue;
      const s = l.seed;
      const n = Math.sin(t * 0.004 + s) * 0.06 + Math.sin(t * 0.021 + s * 2.3) * 0.04;
      // occasional hard dropout, like a dying tube
      const dropout = Math.max(0, Math.sin(t * 0.0011 + s * 1.7) * 3 - 2.8) * 0.85;
      l.light.intensity = Math.max(0.2, l.base * (1 + n) * (1 - dropout));
      if (l.bulb) l.bulb.material.emissiveIntensity = 1.4 + n * 5 * (1 - dropout);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.group.clear();
  }
}

function w(mesh) { return mesh.geometry.parameters.width; }
function d(mesh) { return mesh.geometry.parameters.depth; }

export default Room;

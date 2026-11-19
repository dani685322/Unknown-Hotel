// src/world/Room.js — Phase 5: geometry builder for one generated room descriptor
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './roomGen.js';
import { createRoomMaterials } from './surfaceMaterials.js';

// Door opening, shared with Door.js later
export const DOOR = { width: 1.15, height: 2.25, thickness: 0.18 };

// local space: x in [-w/2, w/2], z in [-L/2, L/2]
// entry (back wall) at +z, exit doorway at -z  ->  player walks toward -z
export class Room {
  constructor(desc) {
    this.desc = desc;
    this.rand = mulberry32(desc.index * 7919 + 1);
    this.materials = createRoomMaterials(desc);
    this.ownedMaterials = new Set();

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

    const bulb = this._box(0.16, 0.06, 0.16, this.materials.bulb);
    bulb.position.set(x, this.height - 0.12, z);
    bulb.userData.noMerge = true;
    this.group.add(bulb);

    this.lights.push({ light, bulb, base, flicker, seed: this.rand() * 100 });
  }

  // wall spanning x, containing the exit doorway (local -z end)
  _doorWall(z, facing) {
    const MAT = this.materials;
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
    const MAT = this.materials;
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
    const MAT = this.materials;

    // floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, L), MAT.floor);
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // ceiling (garden: raised, with an open skylight strip)
    if (archetype === 'garden') {
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, L), MAT.ceiling);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.y = h;
      this.group.add(ceil);
    } else {
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, L), MAT.ceiling);
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

      const cornice = this._box(0.14, 0.12, L, MAT.trim);
      cornice.position.set(s * (w / 2 - 0.12), h - 0.12, 0);
      this.group.add(cornice);
    }

    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, L - 1, 8), MAT.metal);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(w / 2 - 0.24, h - 0.42, 0);
    this.group.add(pipe);

    if (w > 4.5) {
      const radiatorGeometry = new THREE.BoxGeometry(0.07, 0.72, 0.08);
      const radiator = new THREE.InstancedMesh(radiatorGeometry, MAT.metal, 6);
      const transform = new THREE.Object3D();
      for (let i = 0; i < 6; i++) {
        transform.position.set(-0.3 + i * 0.12, 0.42, 0);
        transform.updateMatrix();
        radiator.setMatrixAt(i, transform.matrix);
      }
      radiator.position.set(-w / 2 + 0.16, 0, L / 2 - 3);
      this.group.add(radiator);
      const radiatorTop = this._box(0.1, 0.08, 0.86, MAT.metal);
      radiatorTop.position.set(-w / 2 + 0.16, 0.8, L / 2 - 3);
      this.group.add(radiatorTop);
      const radiatorBottom = this._box(0.1, 0.08, 0.86, MAT.metal);
      radiatorBottom.position.set(-w / 2 + 0.16, 0.08, L / 2 - 3);
      this.group.add(radiatorBottom);
    }

    /* ---------------------------------------------------------- lighting */
    this._lamp(0, 0, archetype === 'garden' ? 15 : this.desc.lit ? 7 : 1.8, true);

    /* ------------------------------------------------------------ hiding */
    const spotCount = this.desc.hidingSpots;
    for (let i = 0; i < spotCount; i++) {
      const s = i % 2 === 0 ? -1 : 1;
      const z = -L / 2 + ((i + 1) / (spotCount + 1)) * L;
      this._closet(s * (w / 2 - 0.32), z, -s);
    }

    /* ------------------------------------------------------------ props */
    this._props(archetype, rand);
    this._decayDetails(rand);
    this._mergeStaticMeshes();
  }

  _props(archetype, rand) {
    const { width: w, length: L } = this.desc;
    const MAT = this.materials;
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

  _decayDetails(rand) {
    const { width: w, length: L } = this.desc;
    if (w < 4.5 || L < 14) return;
    const x = (rand() > 0.5 ? 1 : -1) * (w * 0.18 + rand() * 0.35);
    const z = (rand() * 0.6 - 0.2) * L;
    const chair = new THREE.Group();
    const seat = this._box(0.58, 0.12, 0.58, this.materials.wood);
    seat.position.set(0, 0.44, 0);
    chair.add(seat);
    const back = this._box(0.58, 0.62, 0.1, this.materials.wood);
    back.position.set(0, 0.77, -0.23);
    chair.add(back);
    for (const lx of [-0.23, 0.23]) {
      for (const lz of [-0.22, 0.22]) {
        const leg = this._box(0.08, 0.42, 0.08, this.materials.wood);
        leg.position.set(lx, 0.21, lz);
        chair.add(leg);
      }
    }
    chair.position.set(x, 0, z);
    chair.rotation.set(0.03, rand() * Math.PI, rand() > 0.5 ? 0.48 : -0.48);
    this.group.add(chair);

    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.58), this.materials.cloth);
    paper.position.set(-x * 0.6, 0.012, z + 0.7);
    paper.rotation.x = -Math.PI / 2;
    paper.rotation.z = rand() * Math.PI;
    this.group.add(paper);

    const mirrorFrame = this._box(0.1, 1.15, 0.82, this.materials.trim);
    mirrorFrame.position.set(-w / 2 + 0.12, 1.62, -L / 2 + 4);
    this.group.add(mirrorFrame);
    this.materials.mirror = new THREE.MeshStandardMaterial({ color: 0x59636a, metalness: 0.72, roughness: 0.26 });
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.98), this.materials.mirror);
    mirror.position.set(-w / 2 + 0.065, 1.62, -L / 2 + 4);
    mirror.rotation.y = Math.PI / 2;
    this.group.add(mirror);

    this.materials.crack = new THREE.MeshBasicMaterial({ color: 0x17110d });
    for (const [offset, angle, scale] of [[-0.16, 0.4, 0.48], [0.02, -0.5, 0.36], [0.18, 0.58, 0.42]]) {
      const crack = this._box(0.014, scale, 0.012, this.materials.crack);
      crack.position.set(-w / 2 + 0.082, 1.62, -L / 2 + 4 + offset);
      crack.rotation.x = angle;
      this.group.add(crack);
    }

    if (this.desc.archetype === 'suite' || this.desc.archetype === 'garden') {
      const side = rand() > 0.5 ? 1 : -1;
      const windowZ = -L * 0.18;
      this.materials.window = new THREE.MeshStandardMaterial({
        color: 0x29343a,
        emissive: 0x111a20,
        emissiveIntensity: 0.4,
        metalness: 0.12,
        roughness: 0.38,
      });
      const recess = this._box(0.08, 1.34, 1.72, this.materials.trim);
      recess.position.set(side * (w / 2 - 0.1), 1.95, windowZ);
      this.group.add(recess);
      const glass = this._box(0.035, 1.08, 1.42, this.materials.window);
      glass.position.set(side * (w / 2 - 0.15), 1.95, windowZ);
      this.group.add(glass);
      for (const zOffset of [-0.76, 0.76]) {
        const jamb = this._box(0.1, 1.42, 0.12, this.materials.wood);
        jamb.position.set(side * (w / 2 - 0.18), 1.95, windowZ + zOffset);
        this.group.add(jamb);
      }
      const sill = this._box(0.24, 0.1, 1.72, this.materials.wood);
      sill.position.set(side * (w / 2 - 0.2), 1.27, windowZ);
      this.group.add(sill);
    }
  }

  _mergeStaticMeshes() {
    const meshesByMaterial = new Map();
    for (const child of [...this.group.children]) {
      if (!child.isMesh || child.isInstancedMesh || child.userData.noMerge || Array.isArray(child.material)) continue;
      const key = child.material.uuid;
      if (!meshesByMaterial.has(key)) meshesByMaterial.set(key, { material: child.material, meshes: [] });
      child.updateMatrix();
      const geometry = child.geometry.clone().applyMatrix4(child.matrix);
      meshesByMaterial.get(key).meshes.push({ mesh: child, geometry });
    }

    for (const { material, meshes } of meshesByMaterial.values()) {
      const mergedGeometry = mergeGeometries(meshes.map(({ geometry }) => geometry), false);
      if (!mergedGeometry) {
        for (const { geometry } of meshes) geometry.dispose();
        continue;
      }
      for (const { mesh, geometry } of meshes) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        geometry.dispose();
      }
      const merged = new THREE.Mesh(mergedGeometry, material);
      merged.userData.noMerge = true;
      this.group.add(merged);
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
    const ownedMaterials = new Set([...Object.values(this.materials), ...this.ownedMaterials]);
    for (const material of ownedMaterials) {
      material.map?.dispose();
      material.normalMap?.dispose();
      material.roughnessMap?.dispose();
      material.dispose();
    }
    this.ownedMaterials.clear();
  }
}

function w(mesh) { return mesh.geometry.parameters.width; }
function d(mesh) { return mesh.geometry.parameters.depth; }

export default Room;

import * as THREE from 'three';

const COLORS = {
  chaser: 0x3c2829,
  rush: 0xd52a22,
  ambush: 0x2fb84e,
};

export class Chaser {
  constructor({ id, type = 'chaser', room, player, position, speed = 1.35, damage = 18 }) {
    this.id = id;
    this.type = type;
    this.room = room;
    this.player = player;
    this.speed = speed;
    this.damage = damage;
    this.enabled = true;
    this.attackCooldown = 0;
    this.group = new THREE.Group();
    this.group.name = `${type}-${id}`;
    const material = new THREE.MeshStandardMaterial({
      color: COLORS[type] ?? COLORS.chaser,
      roughness: 0.9,
      emissive: type === 'rush' ? 0xff1f12 : type === 'ambush' ? 0x18a84a : 0x080506,
      emissiveIntensity: type === 'rush' || type === 'ambush' ? 0.7 : 0.45,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 3, 6), material);
    body.position.y = 0.8;
    this.group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 8, 6), material);
    head.position.set(0, 1.5, -0.02);
    this.group.add(head);
    this.group.position.set(position.x, 0, position.z);
    room.group.add(this.group);
  }

  update(dt, context = {}) {
    if (!this.enabled || this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (context.hidden || this.player.hidden) return;
    const dx = this.player.position.x - this.group.position.x;
    const dz = this.player.position.z - this.group.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1.35) {
      if (this.attackCooldown === 0) {
        this.player.damage(this.damage);
        this.attackCooldown = 1.1;
      }
      return;
    }
    if (distance < 0.001) return;

    let moveX = (dx / distance) * this.speed * dt;
    let moveZ = (dz / distance) * this.speed * dt;
    const collides = (x, z) => this.room.colliders.some((box) =>
      x + 0.3 > box.minX && x - 0.3 < box.maxX &&
      z + 0.3 > box.minZ && z - 0.3 < box.maxZ
    );
    if (collides(this.group.position.x + moveX, this.group.position.z + moveZ)) {
      moveX = -moveZ;
      moveZ = (dx / distance) * this.speed * dt;
    }
    if (!collides(this.group.position.x + moveX, this.group.position.z + moveZ)) {
      this.group.position.x += moveX;
      this.group.position.z += moveZ;
    }
    this.group.rotation.y = Math.atan2(dx, dz);
  }

  destroy() {
    this.room.group.remove(this.group);
    this.group.traverse((object) => {
      object.geometry?.dispose();
      if (object.material) object.material.dispose();
    });
  }
}

export default Chaser;

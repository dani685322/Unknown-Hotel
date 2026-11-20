import * as THREE from 'three';
import { createEntitySprite } from './EntityTextures.js';
import { chooseEntityEncounter } from '../world/legacyRoomGeneration.js';

export const legacyEntityMethods = {
            disposeEntityMesh(mesh) {
                if (!mesh) return;
                mesh.parent?.remove(mesh);
                mesh.traverse((object) => {
                    object.geometry?.dispose();
                    const materials = Array.isArray(object.material) ? object.material : [object.material];
                    materials.forEach((material) => material?.dispose());
                });
            },
            clearAllEntities() {
                [this.rushEntity, this.screechEntity, this.eyesEntity, this.figureEntity, this.seekEntity].forEach(ent => {
                    if (ent && ent.mesh) this.disposeEntityMesh(ent.mesh);
                });
                this.rushEntity = null; this.screechEntity = null; this.eyesEntity = null; this.figureEntity = null; this.seekEntity = null;
                document.getElementById('screech-indicator').classList.add('hidden');
                document.getElementById('vignette-layer').classList.remove('eyes-aura', 'hide-warning');
            },
            evaluateRoomEntitySpawns(roomObj) {
                if (this.eyesEntity) {
                    this.disposeEntityMesh(this.eyesEntity.mesh);
                    this.eyesEntity = null;
                    document.getElementById('vignette-layer').classList.remove('eyes-aura');
                }
                if (this.figureEntity && roomObj.roomType !== 'library') {
                    this.disposeEntityMesh(this.figureEntity.mesh);
                    this.figureEntity = null;
                }

                if (roomObj.roomType === 'seek') { this.spawnSeekChase(roomObj); return; }
                if (roomObj.roomType === 'library') return;

                const encounter = chooseEntityEncounter({
                    roomType: roomObj.roomType,
                    roomNum: this.currentRoomNum,
                    sessionSeed: this.sessionSeed,
                    lastEntityRoom: this.lastEntityRoom,
                });
                if (!encounter) return;

                this.lastEntityRoom = this.currentRoomNum;
                if (encounter === 'screech') {
                    setTimeout(() => { if (this.isAlive && this.currentRoomData === roomObj) this.spawnScreech(); }, 1600);
                } else if (encounter === 'ambush') {
                    this.spawnRushOrAmbush(true);
                } else if (encounter === 'rush') {
                    this.spawnRushOrAmbush(false);
                } else if (encounter === 'eyes') {
                    this.spawnEyes(roomObj);
                }
            },
            flickerCurrentRoomLights() {
                this.sound.playLightFlicker();
                if (!this.currentRoomData) return;
                this.currentRoomData.roomLights.forEach(rl => {
                    let count = 0;
                    const iv = setInterval(() => {
                        rl.light.intensity = (count % 2 === 0) ? 0.08 : 1.5;
                        count++;
                        if (count > 8) { clearInterval(iv); rl.light.intensity = 0.9; }
                    }, 85);
                });
            },
            spawnRushOrAmbush(isAmbush = false, fromNetwork = false) {
                if (this.rushEntity || !this.currentRoomData) return;
                if (!fromNetwork) {
                    this.multiplayer.broadcast({ type: 'spawnEntity', entityType: isAmbush ? 'ambush' : 'rush' });
                }

                this.flickerCurrentRoomLights();
                this.showBanner(isAmbush ? '🟢 Lights flickered wildly... AMBUSH is rebounding!' : '⚡ The lights flickered... Hide in a Wardrobe [E] NOW!');

                const group = new THREE.Group();
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: isAmbush ? this.ambushTex : this.rushTex, transparent: true, opacity: 0.28, depthWrite: false }));
                sprite.scale.set(4.25, 4.25, 1);
                group.add(sprite);

                // Give the warning silhouette real depth so it reads as a mesh
                // when its light cuts through the corridor fog.
                const face = new THREE.Group();
                const faceMaterial = new THREE.MeshStandardMaterial({
                    color: isAmbush ? 0x071710 : 0x09090c,
                    roughness: 0.42,
                    metalness: 0.12,
                    emissive: isAmbush ? 0x052318 : 0x180306,
                    emissiveIntensity: 0.55,
                });
                const skull = new THREE.Mesh(new THREE.SphereGeometry(0.68, 20, 16), faceMaterial);
                skull.scale.set(1, 1.18, 0.72);
                skull.castShadow = true;
                face.add(skull);
                const eyeMaterial = new THREE.MeshBasicMaterial({ color: isAmbush ? 0x6effbd : 0xff3147 });
                const eyeGeometry = new THREE.SphereGeometry(0.105, 10, 8);
                for (const side of [-1, 1]) {
                    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
                    eye.position.set(side * 0.23, 0.13, 0.44);
                    face.add(eye);
                }
                const mouth = new THREE.Mesh(
                    new THREE.SphereGeometry(0.27, 12, 8),
                    new THREE.MeshBasicMaterial({ color: 0x010102 })
                );
                mouth.scale.set(0.84, 1.15, 0.42);
                mouth.position.set(0, -0.35, 0.43);
                face.add(mouth);
                const toothMaterial = new THREE.MeshStandardMaterial({ color: 0xc7c0ad, roughness: 0.64 });
                for (const side of [-1, 1]) {
                    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.17, 5), toothMaterial);
                    tooth.rotation.x = Math.PI;
                    tooth.position.set(side * 0.105, -0.25, 0.53);
                    face.add(tooth);
                }
                face.position.y = 0.04;
                group.add(face);

                const auraGeo = new THREE.BufferGeometry();
                const pArr = new Float32Array(80 * 3);
                for (let i = 0; i < 80; i++) {
                    const a = Math.random() * Math.PI * 2, r = 1.0 + Math.random() * 1.4;
                    pArr[i * 3] = Math.cos(a) * r; pArr[i * 3 + 1] = Math.sin(a) * r; pArr[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
                }
                auraGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
                const auraPts = new THREE.Points(auraGeo, new THREE.PointsMaterial({ color: isAmbush ? 0x34d399 : 0x18181b, size: 0.35, transparent: true, opacity: 0.85 }));
                group.add(auraPts, new THREE.PointLight(isAmbush ? 0x10b981 : 0xff2222, 2.8, 22));

                const startZ = this.currentRoomData.origin.z + 25;
                const endZ = this.currentRoomData.origin.z - this.currentRoomData.length - 4;
                group.position.set(0, 1.9, startZ);
                this.scene.add(group);

                this.rushEntity = { id: this.nextEntityId(isAmbush ? 'ambush' : 'rush'), isAmbush, mesh: group, auraPts, startZ, endZ, dir: -1, reboundsLeft: isAmbush ? 3 : 0, speed: isAmbush ? 28 : 21, delayTimer: 2.3 };
                this.updateHUD();
            },
            spawnScreech(fromNetwork = false) {
                if (this.screechEntity || !this.isAlive) return;
                if (!fromNetwork) this.multiplayer.broadcast({ type: 'spawnEntity', entityType: 'screech' });
                this.sound.playScreechPsst();
                document.getElementById('screech-indicator').classList.remove('hidden');

                const behindAngle = this.yaw + Math.PI + (Math.random() - 0.5) * 1.1;
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.screechTex, transparent: true }));
                sprite.scale.set(1.45, 1.45, 1);
                sprite.position.set(this.playerPos.x - Math.sin(behindAngle) * 2.7, this.playerPos.y + 0.22, this.playerPos.z - Math.cos(behindAngle) * 2.7);
                this.scene.add(sprite);

                this.screechEntity = { id: this.nextEntityId('screech'), mesh: sprite, timer: 2.8, stareProgress: 0 };
                this.updateHUD();
            },
            spawnEyes(roomObj, fromNetwork = false) {
                if (this.eyesEntity) return;
                if (!fromNetwork) this.multiplayer.broadcast({ type: 'spawnEntity', entityType: 'eyes' });

                const group = new THREE.Group();
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.eyesTex, transparent: true }));
                sprite.scale.set(2.7, 2.7, 1);
                group.add(sprite, new THREE.PointLight(0xa855f7, 2.6, 16));
                group.position.set(0, 2.05, roomObj.origin.z - roomObj.length * 0.55);
                this.scene.add(group);

                this.eyesEntity = { id: this.nextEntityId('eyes'), mesh: group, baseY: 2.05 };
                this.showBanner('👁️ Eyes appeared! Look down at the carpet while passing!');
                this.updateHUD();
            },
            spawnFigure(originVec, length) {
                const group = new THREE.Group();
                const fleshMat = new THREE.MeshStandardMaterial({ color: 0x6b2019, roughness: 0.72, metalness: 0.08 });
                const boneMat = new THREE.MeshStandardMaterial({ color: 0xd6c7b2, roughness: 0.5 });

                const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.36, 1.65, 12), fleshMat);
                torso.position.y = 1.95;
                group.add(torso);

                for (let r = 0; r < 4; r++) {
                    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.46 - r * 0.03, 0.045, 6, 14, Math.PI * 1.4), boneMat);
                    rib.position.set(0, 2.38 - r * 0.24, 0.05); rib.rotation.x = Math.PI / 2; rib.rotation.z = -Math.PI * 0.2;
                    group.add(rib);
                }

                const head = new THREE.Mesh(new THREE.SphereGeometry(0.56, 16, 16), fleshMat); head.position.y = 3.12;
                const mouthCavity = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.28, 0.24, 14), new THREE.MeshBasicMaterial({ color: 0x120303 }));
                mouthCavity.rotation.x = Math.PI / 2; mouthCavity.position.set(0, 3.12, 0.44);
                group.add(head, mouthCavity);

                for (let t = 0; t < 10; t++) {
                    const a = (t / 10) * Math.PI * 2;
                    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 6), boneMat);
                    tooth.position.set(Math.cos(a) * 0.31, 3.12 + Math.sin(a) * 0.31, 0.54);
                    tooth.rotation.z = a + Math.PI / 2;
                    group.add(tooth);
                }

                const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 1.65, 8), fleshMat); leftArm.position.set(-0.68, 1.95, 0);
                const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 1.65, 8), fleshMat); rightArm.position.set(0.68, 1.95, 0);
                const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 1.35, 8), fleshMat); leftLeg.position.set(-0.26, 0.68, 0);
                const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 1.35, 8), fleshMat); rightLeg.position.set(0.26, 0.68, 0);
                const figLight = new THREE.PointLight(0xff2a2a, 1.5, 10); figLight.position.y = 2.8;
                group.add(leftArm, rightArm, leftLeg, rightLeg, figLight);

                group.position.set(0, 0, originVec.z - length * 0.5);
                this.scene.add(group);
                this.figureEntity = { id: this.nextEntityId('figure'), mesh: group, limbs: { leftArm, rightArm, leftLeg, rightLeg }, patrolTimer: 0, originZ: originVec.z - length * 0.5 };
                this.updateHUD();
            },
            spawnSeekChase(roomObj, fromNetwork = false) {
                if (this.seekEntity) return;
                if (!fromNetwork) this.multiplayer.broadcast({ type: 'spawnEntity', entityType: 'seek' });
                this.showBanner('🏃 RUN! SEEK IS CHASING YOU! Sprint toward the glowing blue door!');
                const group = new THREE.Group();
                const inkMat = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.15, metalness: 0.35 });

                const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.25, 1.2, 10), inkMat); torso.position.y = 1.65;
                const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 14), inkMat); head.position.y = 2.52;
                const whiteEye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })); whiteEye.position.set(0, 2.54, -0.24);
                const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0x000000 })); pupil.position.set(0, 2.54, -0.37);
                const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 1.05, 8), inkMat); leftArm.position.set(-0.44, 1.68, 0);
                const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 1.05, 8), inkMat); rightArm.position.set(0.44, 1.68, 0);
                const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 1.15, 8), inkMat); leftLeg.position.set(-0.18, 0.58, 0);
                const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 1.15, 8), inkMat); rightLeg.position.set(0.18, 0.58, 0);
                const redGlow = new THREE.PointLight(0xff0033, 2.8, 16); redGlow.position.y = 2.1;
                group.add(torso, head, whiteEye, pupil, leftArm, rightArm, leftLeg, rightLeg, redGlow);

                group.position.set(0, 0, roomObj.origin.z + 4.8);
                this.scene.add(group);
                this.seekEntity = { id: this.nextEntityId('seek'), mesh: group, limbs: { leftArm, rightArm, leftLeg, rightLeg }, speed: 5.85 };
                this.updateHUD();
            },
            triggerDupeAttack() {
                this.sound.playJumpscareScream();
                this.triggerJumpscareVisual('rush');
                this.screenShake = 0.35;
                this.damagePlayer(42, 'Dupe', 'You entered a fake door disguised by Dupe! Always track the door number on the top plaque.');
                this.showBanner('🚪 THAT WAS A FAKE DUPE DOOR! (-42 Vitality)');
            },
            tryCrucifixBanish(entityName, entityMesh) {
                const equipped = this.inventory[this.selectedSlot];
                if (equipped && equipped.id === 'crucifix') {
                    this.consumeItem('crucifix', 1);
                    this.sound.playCrucifixBanish();
                    const vig = document.getElementById('vignette-layer');
                    vig.classList.add('crucifix-glow');
                    setTimeout(() => vig.classList.remove('crucifix-glow'), 1200);
                    if (entityMesh) this.disposeEntityMesh(entityMesh);
                    this.showBanner(`✝️ CRUCIFIX ACTIVATED! Banished ${entityName}!`);
                    return true;
                }
                return false;
            },
            triggerJumpscareVisual(type) {
                const jc = document.getElementById('jumpscare-canvas');
                jc.width = window.innerWidth; jc.height = window.innerHeight;
                jc.classList.remove('hidden');
                const ctx = jc.getContext('2d');
                const texCanvas = createEntitySprite(type).image;
                let frames = 0;
                const iv = setInterval(() => {
                    ctx.fillStyle = frames % 2 === 0 ? 'rgba(120,0,0,0.68)' : 'rgba(0,0,0,0.88)';
                    ctx.fillRect(0, 0, jc.width, jc.height);
                    const size = Math.min(jc.width, jc.height) * (0.78 + Math.random() * 0.35);
                    ctx.drawImage(texCanvas, (jc.width - size) / 2 + (Math.random() - 0.5) * 45, (jc.height - size) / 2 + (Math.random() - 0.5) * 45, size, size);
                    if (++frames > 9) { clearInterval(iv); jc.classList.add('hidden'); }
                }, 45);
            },
            updateEntities(dt, elapsed, lookDir) {
                if (this.rushEntity) {
                    const r = this.rushEntity;
                    if (r.auraPts) r.auraPts.rotation.z += dt * 4.5;
                    if (r.delayTimer > 0) {
                        r.delayTimer -= dt;
                    } else {
                        r.mesh.position.z += r.dir * r.speed * dt;
                        const distToPlayer = r.mesh.position.distanceTo(this.playerPos);
                        if (distToPlayer < 16) this.screenShake = Math.max(this.screenShake, (1 - distToPlayer / 16) * 0.14);
                        if (Math.random() < 0.35) this.sound.playRushRumble(Math.max(0.1, 1 - distToPlayer / 25), r.isAmbush);

                        if (distToPlayer < 2.6 && !this.isHiding) {
                            const name = r.isAmbush ? 'Ambush' : 'Rush';
                            if (this.tryCrucifixBanish(name, r.mesh)) { this.rushEntity = null; return; }
                            this.sound.playJumpscareScream();
                            this.triggerJumpscareVisual(r.isAmbush ? 'ambush' : 'rush');
                            this.disposeEntityMesh(r.mesh);
                            this.rushEntity = null;
                            this.damagePlayer(100, name, r.isAmbush
                                ? 'Ambush rebounds multiple times! Hop in and out of wardrobes to avoid Hide.'
                                : 'Whenever chandeliers flicker and rumble, hide inside a Wardrobe [E] right away!');
                            return;
                        }

                        if ((r.dir === -1 && r.mesh.position.z <= r.endZ) || (r.dir === 1 && r.mesh.position.z >= r.startZ)) {
                            if (r.reboundsLeft > 0) {
                                r.reboundsLeft--; r.dir *= -1;
                                this.showBanner(`🟢 Ambush is rebounding! (${r.reboundsLeft + 1} pass remaining)`);
                            } else {
                                this.disposeEntityMesh(r.mesh);
                                this.rushEntity = null;
                                this.showBanner('The entity has passed. It is safe to come out.');
                            }
                        }
                    }
                }

                if (this.screechEntity) {
                    const s = this.screechEntity;
                    s.timer -= dt;
                    const dot = lookDir.dot(s.mesh.position.clone().sub(this.camera.position).normalize());
                    if (dot > 0.84) {
                        s.stareProgress += dt;
                        if (s.stareProgress > 0.24) {
                            this.sound.playDoorOpen();
                            this.disposeEntityMesh(s.mesh); this.screechEntity = null;
                            document.getElementById('screech-indicator').classList.add('hidden');
                            this.showBanner('🔦 You stared down Screech and scared it away!');
                        }
                    } else if (s.timer <= 0) {
                        if (!this.tryCrucifixBanish('Screech', s.mesh)) {
                            this.sound.playJumpscareScream();
                            this.triggerJumpscareVisual('screech');
                            this.screenShake = 0.25;
                            this.damagePlayer(38, 'Screech', 'When you hear "Psst!" in dark rooms, spin around immediately and stare at Screech.');
                        }
                        this.disposeEntityMesh(s.mesh); this.screechEntity = null;
                        document.getElementById('screech-indicator').classList.add('hidden');
                    }
                }

                if (this.eyesEntity) {
                    const eMesh = this.eyesEntity.mesh;
                    eMesh.position.y = this.eyesEntity.baseY + Math.sin(elapsed * 3.2) * 0.16;
                    const dot = lookDir.dot(eMesh.position.clone().sub(this.camera.position).normalize());
                    if (dot > 0.65 && eMesh.position.distanceTo(this.playerPos) < 16 && !this.isHiding) {
                        if (this.tryCrucifixBanish('Eyes', eMesh)) {
                            this.eyesEntity = null;
                            document.getElementById('vignette-layer').classList.remove('eyes-aura');
                            return;
                        }
                        document.getElementById('vignette-layer').classList.add('eyes-aura');
                        this.damagePlayer(22 * dt, 'Eyes', 'Never look directly into Eyes! Look down at the floor while passing.');
                    } else {
                        document.getElementById('vignette-layer').classList.remove('eyes-aura');
                    }
                }

                if (this.figureEntity) {
                    const f = this.figureEntity;
                    f.patrolTimer += dt;
                    const isMoving = this.moveState.forward || this.moveState.backward || this.moveState.left || this.moveState.right ||
                        Math.abs(this.joystickVec.x) > 0.15 || Math.abs(this.joystickVec.y) > 0.15;
                    const playerMakingNoise = !this.isCrouching && !this.isHiding && isMoving;

                    const prevPos = f.mesh.position.clone();
                    if (playerMakingNoise) {
                        f.mesh.position.add(this.playerPos.clone().sub(f.mesh.position).setY(0).normalize().multiplyScalar(6.4 * dt));
                    } else {
                        f.mesh.position.x = Math.sin(f.patrolTimer * 0.72) * 5.2;
                        f.mesh.position.z = f.originZ + Math.cos(f.patrolTimer * 0.45) * 6.5;
                    }
                    const moveDelta = f.mesh.position.clone().sub(prevPos);
                    if (moveDelta.lengthSq() > 0.0001) f.mesh.rotation.y = Math.atan2(moveDelta.x, moveDelta.z);
                    const stride = Math.sin(elapsed * (playerMakingNoise ? 10 : 5)) * 0.55;
                    f.limbs.leftArm.rotation.x = stride; f.limbs.rightArm.rotation.x = -stride;
                    f.limbs.leftLeg.rotation.x = -stride; f.limbs.rightLeg.rotation.x = stride;

                    const dist = f.mesh.position.distanceTo(this.playerPos);
                    if (dist < 6.5 && Math.random() < 0.08) this.sound.playHeartbeat();
                    if (dist < 1.95 && !this.isHiding) {
                        if (this.tryCrucifixBanish('Figure', null)) { f.mesh.position.z = f.originZ - 7; return; }
                        this.sound.playJumpscareScream();
                        this.damagePlayer(100, 'Figure', 'Figure is blind but hears footsteps! Stay Crouched [C] in Door 050.');
                    }
                }

                if (this.seekEntity) {
                    const sk = this.seekEntity;
                    const dir = this.playerPos.clone().sub(sk.mesh.position).setY(0).normalize();
                    sk.mesh.position.add(dir.multiplyScalar(sk.speed * dt));
                    sk.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
                    const runCycle = Math.sin(elapsed * 14) * 0.85;
                    sk.limbs.leftArm.rotation.x = runCycle; sk.limbs.rightArm.rotation.x = -runCycle;
                    sk.limbs.leftLeg.rotation.x = -runCycle; sk.limbs.rightLeg.rotation.x = runCycle;

                    if (sk.mesh.position.distanceTo(this.playerPos) < 1.55) {
                        if (this.tryCrucifixBanish('Seek', sk.mesh)) { this.seekEntity = null; return; }
                        this.sound.playJumpscareScream();
                        this.damagePlayer(100, 'Seek', 'Sprint straight toward the glowing blue door and use Vitamins [F] for extra speed!');
                    }
                }
            },
};

export function installLegacyEntityMethods(GameClass) {
  Object.assign(GameClass.prototype, legacyEntityMethods);
}

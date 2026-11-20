import { THREE, Peer, EffectComposer, RenderPass, UnrealBloomPass } from './legacy-dependencies.js';
import { Admin } from './Admin.js';
import './ui/admin-terminal.css';

        /***********************************************************************
         * 1. PROCEDURAL WEB AUDIO API SOUND SYNTHESIZER
         ***********************************************************************/
        class SoundEngine {
            constructor() {
                this.ctx = null;
                this.masterGain = null;
                this.ambientOsc = null;
                this.ambientGain = null;
            }

            init() {
                try {
                    if (this.ctx) {
                        if (this.ctx.state === 'suspended') this.ctx.resume();
                        return;
                    }
                    const AudioCtx = window.AudioContext || window.webkitAudioContext;
                    if (!AudioCtx) return;
                    this.ctx = new AudioCtx();
                    this.masterGain = this.ctx.createGain();
                    this.masterGain.gain.value = 0.55;
                    this.masterGain.connect(this.ctx.destination);
                    this.startAmbientHum();
                } catch (err) {
                    console.warn('Audio init skipped:', err);
                }
            }

            startAmbientHum() {
                if (!this.ctx) return;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = 44;
                gain.gain.value = 0.035;
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start();
                this.ambientOsc = osc;
                this.ambientGain = gain;
            }

            setRoomMood(roomType) {
                if (!this.ctx || !this.ambientOsc || !this.ambientGain) return;
                const moods = {
                    dark: [35, 0.052], seek: [51, 0.03], library: [40, 0.028],
                    courtyard: [54, 0.022], finale: [48, 0.034], standard: [44, 0.035],
                };
                const [frequency, volume] = moods[roomType] ?? moods.standard;
                const now = this.ctx.currentTime;
                this.ambientOsc.frequency.cancelScheduledValues(now);
                this.ambientGain.gain.cancelScheduledValues(now);
                this.ambientOsc.frequency.setTargetAtTime(frequency, now, 0.8);
                this.ambientGain.gain.setTargetAtTime(volume, now, 0.8);
            }

            playFootstep(crouching = false) {
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(crouching ? 72 : 108, now);
                osc.frequency.exponentialRampToValueAtTime(26, now + 0.09);
                gain.gain.setValueAtTime(crouching ? 0.04 : 0.16, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.1);
            }

            playDoorOpen() {
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.linearRampToValueAtTime(220, now + 0.18);
                osc.frequency.exponentialRampToValueAtTime(60, now + 0.42);
                gain.gain.setValueAtTime(0.18, now);
                gain.gain.exponentialRampToValueAtTime(0.005, now + 0.45);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.45);
            }

            playDrawerSlide() {
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                const bufferSize = this.ctx.sampleRate * 0.18;
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.5));
                }
                const noise = this.ctx.createBufferSource();
                noise.buffer = buffer;
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = 620;
                const gain = this.ctx.createGain();
                gain.gain.value = 0.22;
                noise.connect(filter);
                filter.connect(gain);
                gain.connect(this.masterGain);
                noise.start(now);
            }

            playLightFlicker() {
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                for (let i = 0; i < 4; i++) {
                    const t = now + i * 0.11;
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(120 + Math.random() * 420, t);
                    gain.gain.setValueAtTime(0.13, t);
                    gain.gain.exponentialRampToValueAtTime(0.005, t + 0.07);
                    osc.connect(gain);
                    gain.connect(this.masterGain);
                    osc.start(t);
                    osc.stop(t + 0.08);
                }
            }

            playPickupChime() {
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                [523.25, 659.25, 783.99].forEach((freq, idx) => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    gain.gain.setValueAtTime(0.14, now + idx * 0.06);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.25);
                    osc.connect(gain);
                    gain.connect(this.masterGain);
                    osc.start(now + idx * 0.06);
                    osc.stop(now + idx * 0.06 + 0.26);
                });
            }

            playScreechPsst() {
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                const bufferSize = this.ctx.sampleRate * 0.22;
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
                const noise = this.ctx.createBufferSource();
                noise.buffer = buffer;
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'highpass';
                filter.frequency.value = 3200;
                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
                noise.connect(filter);
                filter.connect(gain);
                gain.connect(this.masterGain);
                noise.start(now);
            }

            playRushRumble(intensity = 0.5, isAmbush = false) {
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = isAmbush ? 'square' : 'sawtooth';
                osc.frequency.setValueAtTime((isAmbush ? 148 : 66) + Math.random() * 35, now);
                gain.gain.setValueAtTime(Math.min(0.45, intensity * 0.4), now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.17);
            }

            playJumpscareScream() {
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                [185, 280, 425, 620].forEach(freq => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(freq, now);
                    osc.frequency.linearRampToValueAtTime(freq * 1.4, now + 0.55);
                    gain.gain.setValueAtTime(0.25, now);
                    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.65);
                    osc.connect(gain);
                    gain.connect(this.masterGain);
                    osc.start(now);
                    osc.stop(now + 0.65);
                });
            }

            playCrucifixBanish() {
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                [261.63, 329.63, 392.00, 523.25, 659.25].forEach((f, i) => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(f, now + i * 0.08);
                    gain.gain.setValueAtTime(0.22, now + i * 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
                    osc.connect(gain);
                    gain.connect(this.masterGain);
                    osc.start(now + i * 0.08);
                    osc.stop(now + 1.45);
                });
            }

            playHeartbeat() {
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                [0, 0.18].forEach(offset => {
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(60, now + offset);
                    osc.frequency.exponentialRampToValueAtTime(28, now + offset + 0.12);
                    gain.gain.setValueAtTime(0.36, now + offset);
                    gain.gain.exponentialRampToValueAtTime(0.005, now + offset + 0.14);
                    osc.connect(gain);
                    gain.connect(this.masterGain);
                    osc.start(now + offset);
                    osc.stop(now + offset + 0.15);
                });
            }
        }

        /***********************************************************************
         * 2. HIGH-DEFINITION PROCEDURAL PBR TEXTURE & SPRITE FACTORY
         ***********************************************************************/
        class TextureFactory {
            static createWallpaperMaps(dark = false) {
                const w = 512, h = 512;
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                const ctx = c.getContext('2d');

                const bumpC = document.createElement('canvas');
                bumpC.width = w; bumpC.height = h;
                const bctx = bumpC.getContext('2d');

                const wallGrad = ctx.createLinearGradient(0, 0, 0, 340);
                wallGrad.addColorStop(0, dark ? '#110908' : '#261411');
                wallGrad.addColorStop(0.5, dark ? '#1d100d' : '#3d211b');
                wallGrad.addColorStop(1, dark ? '#130a08' : '#291511');
                ctx.fillStyle = wallGrad;
                ctx.fillRect(0, 0, w, 345);

                bctx.fillStyle = '#606060';
                bctx.fillRect(0, 0, w, h);

                for (let x = 0; x < w; x += 64) {
                    ctx.fillStyle = dark ? 'rgba(65,36,28,0.35)' : 'rgba(115,62,48,0.35)';
                    ctx.fillRect(x + 8, 0, 22, 345);
                    bctx.fillStyle = '#787878';
                    bctx.fillRect(x + 8, 0, 22, 345);

                    ctx.fillStyle = dark ? 'rgba(130,96,42,0.2)' : 'rgba(186,142,66,0.28)';
                    ctx.fillRect(x + 6, 0, 2, 345);
                    ctx.fillRect(x + 30, 0, 2, 345);

                    for (let y = 32; y < 320; y += 64) {
                        ctx.fillStyle = dark ? 'rgba(85,48,36,0.32)' : 'rgba(148,84,60,0.34)';
                        ctx.beginPath();
                        ctx.moveTo(x + 48, y - 16);
                        ctx.lineTo(x + 58, y);
                        ctx.lineTo(x + 48, y + 16);
                        ctx.lineTo(x + 38, y);
                        ctx.closePath();
                        ctx.fill();

                        bctx.fillStyle = '#a0a0a0';
                        bctx.beginPath();
                        bctx.moveTo(x + 48, y - 16);
                        bctx.lineTo(x + 58, y);
                        bctx.lineTo(x + 48, y + 16);
                        bctx.lineTo(x + 38, y);
                        bctx.closePath();
                        bctx.fill();
                    }
                }

                ctx.fillStyle = '#5e3d21';
                ctx.fillRect(0, 340, w, 14);
                ctx.fillStyle = '#9c7538';
                ctx.fillRect(0, 344, w, 4);
                bctx.fillStyle = '#ffffff';
                bctx.fillRect(0, 340, w, 14);

                ctx.fillStyle = dark ? '#170d08' : '#2a160c';
                ctx.fillRect(0, 354, w, 158);
                for (let x = 16; x < w; x += 128) {
                    ctx.strokeStyle = '#120804';
                    ctx.lineWidth = 6;
                    ctx.strokeRect(x, 370, 96, 112);
                    ctx.strokeStyle = '#5c381f';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x + 4, 374, 88, 104);
                    bctx.strokeStyle = '#e0e0e0';
                    bctx.lineWidth = 6;
                    bctx.strokeRect(x, 370, 96, 112);
                }

                ctx.fillStyle = '#120805';
                ctx.fillRect(0, 494, w, 18);

                const map = new THREE.CanvasTexture(c);
                map.encoding = THREE.sRGBEncoding;
                map.wrapS = THREE.RepeatWrapping;
                map.wrapT = THREE.ClampToEdgeWrapping;
                map.repeat.set(4, 1);

                const bumpMap = new THREE.CanvasTexture(bumpC);
                bumpMap.wrapS = THREE.RepeatWrapping;
                bumpMap.wrapT = THREE.ClampToEdgeWrapping;
                bumpMap.repeat.set(4, 1);

                return { map, bumpMap };
            }

            static createCarpetMaps() {
                const w = 512, h = 512;
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                const ctx = c.getContext('2d');

                const bumpC = document.createElement('canvas');
                bumpC.width = w; bumpC.height = h;
                const bctx = bumpC.getContext('2d');

                ctx.fillStyle = '#471015';
                ctx.fillRect(0, 0, w, h);
                bctx.fillStyle = '#555555';
                bctx.fillRect(0, 0, w, h);

                for (let i = 0; i < 4000; i++) {
                    const rx = Math.random() * w;
                    const ry = Math.random() * h;
                    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(95,22,28,0.35)' : 'rgba(28,4,7,0.35)';
                    ctx.fillRect(rx, ry, 2, 2);
                    bctx.fillStyle = Math.random() > 0.5 ? '#707070' : '#404040';
                    bctx.fillRect(rx, ry, 2, 2);
                }

                for (let y = 0; y < h; y += 128) {
                    for (let x = 0; x < w; x += 128) {
                        ctx.strokeStyle = '#a87d32';
                        ctx.lineWidth = 5;
                        ctx.beginPath();
                        ctx.moveTo(x + 64, y + 10);
                        ctx.lineTo(x + 118, y + 64);
                        ctx.lineTo(x + 64, y + 118);
                        ctx.lineTo(x + 10, y + 64);
                        ctx.closePath();
                        ctx.stroke();

                        ctx.fillStyle = '#c99c47';
                        ctx.beginPath();
                        ctx.arc(x + 64, y + 64, 10, 0, Math.PI * 2);
                        ctx.fill();

                        bctx.strokeStyle = '#bbbbbb';
                        bctx.lineWidth = 5;
                        bctx.beginPath();
                        bctx.moveTo(x + 64, y + 10);
                        bctx.lineTo(x + 118, y + 64);
                        bctx.lineTo(x + 64, y + 118);
                        bctx.lineTo(x + 10, y + 64);
                        bctx.closePath();
                        bctx.stroke();
                    }
                }

                const map = new THREE.CanvasTexture(c);
                map.encoding = THREE.sRGBEncoding;
                map.wrapS = THREE.RepeatWrapping;
                map.wrapT = THREE.RepeatWrapping;
                map.repeat.set(3, 5);

                const bumpMap = new THREE.CanvasTexture(bumpC);
                bumpMap.wrapS = THREE.RepeatWrapping;
                bumpMap.wrapT = THREE.RepeatWrapping;
                bumpMap.repeat.set(3, 5);

                return { map, bumpMap };
            }

            static createWoodTexture(baseColor = '#3a2013', grainColor = '#211008') {
                const c = document.createElement('canvas');
                c.width = 256; c.height = 256;
                const ctx = c.getContext('2d');
                ctx.fillStyle = baseColor;
                ctx.fillRect(0, 0, 256, 256);

                ctx.strokeStyle = grainColor;
                for (let i = 0; i < 60; i++) {
                    ctx.lineWidth = 1 + Math.random() * 2.5;
                    ctx.globalAlpha = 0.25 + Math.random() * 0.35;
                    const x = Math.random() * 256;
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.bezierCurveTo(x + 12, 85, x - 12, 170, x + (Math.random() - 0.5) * 14, 256);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1.0;

                const tex = new THREE.CanvasTexture(c);
                tex.encoding = THREE.sRGBEncoding;
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                return tex;
            }

            static createCeilingTexture() {
                const c = document.createElement('canvas');
                c.width = 256; c.height = 256;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#1b110c';
                ctx.fillRect(0, 0, 256, 256);
                ctx.strokeStyle = '#3d2719';
                ctx.lineWidth = 16;
                ctx.strokeRect(8, 8, 240, 240);
                ctx.strokeStyle = '#6e4e27';
                ctx.lineWidth = 3;
                ctx.strokeRect(24, 24, 208, 208);

                const tex = new THREE.CanvasTexture(c);
                tex.encoding = THREE.sRGBEncoding;
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(3, 5);
                return tex;
            }

            static createStoneTexture() {
                const c = document.createElement('canvas');
                c.width = 256; c.height = 256;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#18241d';
                ctx.fillRect(0, 0, 256, 256);
                for (let y = 0; y < 256; y += 32) {
                    const offset = (y / 32) % 2 === 0 ? 0 : 16;
                    for (let x = -16; x < 256; x += 32) {
                        const shade = 45 + Math.floor(Math.random() * 25);
                        ctx.fillStyle = `rgb(${shade}, ${shade + 8}, ${shade + 4})`;
                        ctx.fillRect(x + offset + 2, y + 2, 28, 28);
                    }
                }
                const tex = new THREE.CanvasTexture(c);
                tex.encoding = THREE.sRGBEncoding;
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(4, 6);
                return tex;
            }

            static createDoorTexture(doorNumberStr, isBoss = false) {
                const c = document.createElement('canvas');
                c.width = 512; c.height = 1024;
                const ctx = c.getContext('2d');

                const grad = ctx.createLinearGradient(0, 0, 512, 0);
                grad.addColorStop(0, isBoss ? '#220e0a' : '#331a0f');
                grad.addColorStop(0.5, isBoss ? '#3b1811' : '#4f2918');
                grad.addColorStop(1, isBoss ? '#1f0c09' : '#2d160c');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, 512, 1024);

                ctx.strokeStyle = 'rgba(18, 7, 3, 0.35)';
                for (let i = 0; i < 85; i++) {
                    ctx.lineWidth = 2;
                    const x = Math.random() * 512;
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x + (Math.random() - 0.5) * 16, 1024);
                    ctx.stroke();
                }

                const drawPanel = (x, y, pw, ph) => {
                    ctx.fillStyle = 'rgba(0,0,0,0.28)';
                    ctx.fillRect(x, y, pw, ph);
                    ctx.strokeStyle = '#1c0c06';
                    ctx.lineWidth = 10;
                    ctx.strokeRect(x, y, pw, ph);
                    ctx.strokeStyle = '#734529';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(x + 8, y + 8, pw - 16, ph - 16);
                };
                drawPanel(58, 76, 396, 355);
                drawPanel(58, 495, 396, 445);

                const pGrad = ctx.createLinearGradient(116, 168, 396, 286);
                pGrad.addColorStop(0, '#f3d479');
                pGrad.addColorStop(0.5, '#c99b2e');
                pGrad.addColorStop(1, '#8c6515');
                ctx.fillStyle = pGrad;
                ctx.beginPath();
                ctx.roundRect(116, 168, 280, 122, 20);
                ctx.fill();
                ctx.strokeStyle = '#4a3208';
                ctx.lineWidth = 8;
                ctx.stroke();

                ctx.fillStyle = '#170f04';
                ctx.font = 'bold 74px "Cinzel", serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(doorNumberStr, 256, 232);

                const tex = new THREE.CanvasTexture(c);
                tex.encoding = THREE.sRGBEncoding;
                return tex;
            }

            static createPaintingTexture(variant = 0) {
                const c = document.createElement('canvas');
                c.width = 256; c.height = 192;
                const ctx = c.getContext('2d');

                if (variant % 3 === 0) {
                    const g = ctx.createLinearGradient(0, 0, 0, 192);
                    g.addColorStop(0, '#0c1322');
                    g.addColorStop(0.6, '#233142');
                    g.addColorStop(1, '#0b0e12');
                    ctx.fillStyle = g;
                    ctx.fillRect(0, 0, 256, 192);
                    ctx.fillStyle = '#e8dfc5';
                    ctx.beginPath();
                    ctx.arc(190, 52, 22, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#090b10';
                    ctx.beginPath();
                    ctx.moveTo(0, 140); ctx.lineTo(70, 95); ctx.lineTo(145, 130); ctx.lineTo(256, 100); ctx.lineTo(256, 192); ctx.lineTo(0, 192);
                    ctx.fill();
                } else if (variant % 3 === 1) {
                    const g = ctx.createRadialGradient(128, 86, 10, 128, 96, 130);
                    g.addColorStop(0, '#4a2e1f');
                    g.addColorStop(1, '#0e0705');
                    ctx.fillStyle = g;
                    ctx.fillRect(0, 0, 256, 192);
                    ctx.fillStyle = '#080504';
                    ctx.beginPath();
                    ctx.arc(128, 74, 30, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(128, 165, 58, 62, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(255,220,160,0.45)';
                    ctx.fillRect(116, 70, 5, 3);
                    ctx.fillRect(135, 70, 5, 3);
                } else {
                    ctx.fillStyle = '#170808';
                    ctx.fillRect(0, 0, 256, 192);
                    ctx.strokeStyle = '#6b2822';
                    ctx.lineWidth = 3;
                    for (let i = 1; i <= 5; i++) {
                        ctx.strokeRect(i * 20, i * 15, 256 - i * 40, 192 - i * 30);
                    }
                    ctx.fillStyle = '#4fd1ff';
                    ctx.globalAlpha = 0.25;
                    ctx.fillRect(114, 82, 28, 42);
                    ctx.globalAlpha = 1;
                }

                const tex = new THREE.CanvasTexture(c);
                tex.encoding = THREE.sRGBEncoding;
                return tex;
            }



            static createNameplateSprite(name, colorHex = '#34d399') {
                const c = document.createElement('canvas');
                c.width = 256; c.height = 64;
                const ctx = c.getContext('2d');
                ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
                ctx.beginPath();
                ctx.roundRect(12, 10, 232, 44, 14);
                ctx.fill();
                ctx.strokeStyle = colorHex;
                ctx.lineWidth = 3;
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 24px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(name.slice(0, 14), 128, 33);

                const tex = new THREE.CanvasTexture(c);
                tex.encoding = THREE.sRGBEncoding;
                const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
                sp.scale.set(1.5, 0.38, 1);
                return sp;
            }


        }

        /***********************************************************************
         * 3. FIRST-PERSON 3D VIEWMODEL SYSTEM
         ***********************************************************************/
        class ViewmodelController {
            constructor(camera) {
                this.root = new THREE.Group();
                camera.add(this.root);
                this.models = {};
                this.buildAllModels();
            }

            buildAllModels() {
                const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 });
                const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x26262a, metalness: 0.7, roughness: 0.35 });
                const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c341d, roughness: 0.7 });

                // Lighter
                const lighter = new THREE.Group();
                lighter.add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.055), brassMat));
                const cap = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.055), brassMat);
                cap.position.set(-0.07, 0.1, 0);
                cap.rotation.z = 0.9;
                lighter.add(cap);
                const flameGroup = new THREE.Group();
                flameGroup.position.set(0.01, 0.165, 0);
                flameGroup.add(
                    new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.09, 10), new THREE.MeshBasicMaterial({ color: 0xff7b1c, transparent: true, opacity: 0.88 })),
                    new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.055, 8), new THREE.MeshBasicMaterial({ color: 0xfff5b8 }))
                );
                lighter.add(flameGroup);
                lighter.userData.flame = flameGroup;
                lighter.position.set(0.36, -0.32, -0.58);
                lighter.visible = false;
                this.root.add(lighter);
                this.models.lighter = lighter;

                // Flashlight
                const flash = new THREE.Group();
                const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.03, 0.28, 12), darkMetalMat);
                handle.rotation.x = Math.PI / 2;
                const head = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.035, 0.08, 12), darkMetalMat);
                head.rotation.x = Math.PI / 2;
                head.position.z = -0.16;
                const lens = new THREE.Mesh(new THREE.CircleGeometry(0.046, 12), new THREE.MeshBasicMaterial({ color: 0xfff9d6 }));
                lens.position.z = -0.201;
                lens.rotation.y = Math.PI;
                const beamCone = new THREE.Mesh(
                    new THREE.ConeGeometry(0.65, 3.6, 16, 1, true),
                    new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0.055, side: THREE.DoubleSide, depthWrite: false })
                );
                beamCone.rotation.x = Math.PI / 2;
                beamCone.position.z = -2.0;
                flash.add(handle, head, lens, beamCone);
                flash.userData.beam = beamCone;
                flash.userData.lens = lens;
                flash.position.set(0.38, -0.30, -0.55);
                flash.visible = false;
                this.root.add(flash);
                this.models.flashlight = flash;

                // Crucifix
                const crux = new THREE.Group();
                crux.add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.38, 0.025), woodMat));
                const horiz = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.055, 0.025), woodMat);
                horiz.position.y = 0.065;
                const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.01, 8, 24), new THREE.MeshBasicMaterial({ color: 0x4fd1ff }));
                glowRing.position.set(0, 0.065, 0.018);
                crux.add(horiz, glowRing);
                crux.userData.glowRing = glowRing;
                crux.position.set(0.34, -0.22, -0.58);
                crux.visible = false;
                this.root.add(crux);
                this.models.crucifix = crux;

                // Vitamins
                const vits = new THREE.Group();
                vits.add(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.14, 12), new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.35 })));
                const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.032, 12), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }));
                lid.position.y = 0.085;
                vits.add(lid);
                vits.position.set(0.36, -0.30, -0.55);
                vits.visible = false;
                this.root.add(vits);
                this.models.vitamins = vits;

                // Lockpick
                const pick = new THREE.Group();
                pick.add(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.24, 0.008), darkMetalMat));
                const hook = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.014, 0.008), darkMetalMat);
                hook.position.set(-0.018, 0.115, 0);
                pick.add(hook);
                pick.rotation.z = 0.35;
                pick.position.set(0.35, -0.28, -0.55);
                pick.visible = false;
                this.root.add(pick);
                this.models.lockpick = pick;

                // Key
                const key = new THREE.Group();
                const bow = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 8, 16), brassMat);
                bow.position.y = -0.05;
                const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.15, 8), brassMat);
                blade.position.y = 0.05;
                key.add(bow, blade);
                key.rotation.set(-0.4, -0.3, 0.2);
                key.position.set(0.35, -0.28, -0.55);
                key.visible = false;
                this.root.add(key);
                this.models.key = key;
            }

            update(equippedItem, lightOn, isHiding, elapsedTime, walkBob) {
                Object.values(this.models).forEach(m => m.visible = false);
                if (!equippedItem || isHiding) return;
                const model = this.models[equippedItem.id];
                if (!model) return;
                model.visible = true;

                const bobX = Math.cos(walkBob * 0.5) * 0.015;
                const bobY = Math.abs(Math.sin(walkBob * 0.5)) * 0.018 + Math.sin(elapsedTime * 2.2) * 0.006;
                this.root.position.set(bobX, -bobY, 0);

                if (equippedItem.id === 'lighter' && model.userData.flame) {
                    const f = model.userData.flame;
                    f.visible = lightOn && equippedItem.charges > 0;
                    if (f.visible) {
                        const flicker = 0.88 + Math.sin(elapsedTime * 26) * 0.14 + Math.cos(elapsedTime * 41) * 0.08;
                        f.scale.set(0.95, flicker, 0.95);
                    }
                } else if (equippedItem.id === 'flashlight') {
                    const active = lightOn && equippedItem.charges > 0;
                    if (model.userData.beam) model.userData.beam.visible = active;
                    if (model.userData.lens) model.userData.lens.material.color.setHex(active ? 0xfff9d6 : 0x222222);
                } else if (equippedItem.id === 'crucifix' && model.userData.glowRing) {
                    model.userData.glowRing.rotation.z = elapsedTime * 1.4;
                }
            }
        }

        /***********************************************************************
         * 4. PEERJS WEBRTC MULTIPLAYER & 3D AVATAR CONTROLLER
         * Allows Hosting/Joining via 4-letter Room Codes + Optional AI Co-Op Bot
         ***********************************************************************/
        class MultiplayerManager {
            constructor(game) {
                this.game = game;
                this.peer = null;
                this.connections = new Map(); // peerId -> DataConnection
                this.remotePlayers = new Map(); // id -> { group, limbs, targetPos, targetYaw, name, hp, hiding, crouching, light, roomNum }
                this.mode = 'solo'; // 'solo' | 'host' | 'client'
                this.roomCode = '';
                this.myId = 'local-' + Math.random().toString(36).slice(2, 7);
                this.myName = 'Explorer';
                this.lastSyncTime = 0;
                this.botActive = false;
                this.botId = 'ai-bot-helper';
                this.palette = [0x38bdf8, 0x34d399, 0xf472b6, 0xfbbf24];
            }

            generateCode() {
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                let out = '';
                for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
                return out;
            }

            setStatus(msg) {
                const el = document.getElementById('coop-status');
                if (el) el.textContent = msg;
            }

            hostSession(playerName) {
                if (typeof Peer === 'undefined') {
                    this.setStatus('⚠️ PeerJS network library unavailable offline. Use AI Co-Op Bot to test!');
                    return;
                }
                this.disconnect(true);
                this.myName = (playerName || 'Host').trim().slice(0, 14);
                this.roomCode = this.generateCode();
                this.mode = 'host';
                const peerId = `doors3d-hotel-${this.roomCode}`;
                this.setStatus(`Connecting Room ${this.roomCode}...`);

                try {
                    this.peer = new Peer(peerId, { debug: 1 });
                } catch (err) {
                    this.setStatus('⚠️ Could not initialize WebRTC: ' + err.message);
                    this.mode = 'solo';
                    return;
                }

                this.peer.on('open', (id) => {
                    this.myId = id;
                    this.setStatus(`🟢 Hosting Room ${this.roomCode} — Share this code with friends!`);
                    document.getElementById('coop-room-badge').classList.remove('hidden');
                    document.getElementById('coop-code-text').textContent = this.roomCode;
                    document.getElementById('btn-disconnect-coop').classList.remove('hidden');
                    this.updateCoopHUD();

                    if (!this.game.isAlive) {
                        document.getElementById('title-modal').classList.add('hidden');
                        document.getElementById('hud-layer').classList.remove('hidden');
                        this.game.startNewRun();
                    }
                    this.game.showBanner(`🏨 Co-Op Room ${this.roomCode} is LIVE! Friends can join now.`);
                });

                this.peer.on('connection', (conn) => {
                    this.setupConnection(conn);
                });

                this.peer.on('error', (err) => {
                    this.setStatus('⚠️ Network Error: ' + (err.type || err.message));
                });
            }

            joinSession(code, playerName) {
                if (typeof Peer === 'undefined') {
                    this.setStatus('⚠️ PeerJS unavailable offline.');
                    return;
                }
                const cleanCode = (code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (cleanCode.length !== 4) {
                    this.setStatus('⚠️ Enter a valid 4-character Room Code.');
                    return;
                }

                this.disconnect(true);
                this.myName = (playerName || 'Guest').trim().slice(0, 14);
                this.roomCode = cleanCode;
                this.mode = 'client';
                this.setStatus(`Joining Room ${cleanCode}...`);

                try {
                    this.peer = new Peer({ debug: 1 });
                } catch (err) {
                    this.setStatus('⚠️ Could not initialize WebRTC.');
                    this.mode = 'solo';
                    return;
                }

                this.peer.on('open', (id) => {
                    this.myId = id;
                    const hostPeerId = `doors3d-hotel-${cleanCode}`;
                    const conn = this.peer.connect(hostPeerId, { reliable: true });
                    this.setupConnection(conn);
                });

                this.peer.on('error', (err) => {
                    this.setStatus(`⚠️ Could not connect to Room ${cleanCode} (${err.type || 'offline'}).`);
                });
            }

            setupConnection(conn) {
                conn.on('open', () => {
                    this.connections.set(conn.peer, conn);
                    document.getElementById('coop-room-badge').classList.remove('hidden');
                    document.getElementById('coop-code-text').textContent = this.roomCode;
                    document.getElementById('btn-disconnect-coop').classList.remove('hidden');

                    if (this.mode === 'host') {
                        // Send current world seed & room state to newly joined client
                        conn.send({
                            type: 'welcome',
                            sessionSeed: this.game.sessionSeed,
                            currentRoomNum: this.game.currentRoomNum,
                            originZ: this.game.currentRoomData ? this.game.currentRoomData.origin.z : 0,
                            booksFound: this.game.booksFound,
                            libraryCode: this.game.libraryCode
                        });
                        this.addChatMessage('System', 'A new explorer entered the elevator!', '#34d399');
                    } else {
                        this.setStatus(`🟢 Connected to Co-Op Room ${this.roomCode}!`);
                        document.getElementById('title-modal').classList.add('hidden');
                        document.getElementById('coop-modal').classList.add('hidden');
                        document.getElementById('hud-layer').classList.remove('hidden');
                    }
                    this.updateCoopHUD();
                });

                conn.on('data', (data) => this.handleMessage(conn.peer, data));
                conn.on('error', (error) => {
                    this.setStatus(`⚠️ Peer connection error: ${error?.type || error?.message || 'unknown error'}`);
                });

                conn.on('close', () => {
                    this.connections.delete(conn.peer);
                    this.removeRemoteAvatar(conn.peer);
                    this.addChatMessage('System', 'A teammate disconnected.', '#f87171');
                    this.updateCoopHUD();
                });
            }

            broadcast(payload, excludePeerId = null) {
                this.connections.forEach((conn, peerId) => {
                    if (peerId !== excludePeerId && conn.open) {
                        try { conn.send(payload); } catch (e) {}
                    }
                });
            }

            handleMessage(senderPeerId, msg) {
                if (!msg || !msg.type) return;

                // If host receives a message from a client, relay to other clients
                if (this.mode === 'host' && msg.type !== 'welcome') {
                    this.broadcast(msg, senderPeerId);
                }

                if (msg.type === 'welcome') {
                    if (!Number.isFinite(Number(msg.sessionSeed)) || !Number.isFinite(Number(msg.currentRoomNum))) return;
                    this.game.sessionSeed = msg.sessionSeed;
                    this.game.startNewRun(msg.sessionSeed, msg.currentRoomNum, msg.originZ);
                    this.game.booksFound = msg.booksFound || 0;
                    if (msg.libraryCode && msg.libraryCode.length === 5) {
                        this.game.libraryCode = msg.libraryCode;
                        this.game.updateLibraryHUD();
                    }
                    this.game.showBanner(`👥 Synced into Co-Op Room ${this.roomCode} (Door ${String(msg.currentRoomNum).padStart(3, '0')})!`);
                } else if (msg.type === 'state') {
                    const pid = msg.id || senderPeerId;
                    if (pid === this.myId) return;
                    const state = [msg.x, msg.y, msg.z, msg.yaw, msg.hp, msg.roomNum].map(Number);
                    if (!state.every(Number.isFinite)) return;
                    let avatar = this.remotePlayers.get(pid);
                    if (!avatar) {
                        avatar = this.createRemoteAvatar(pid, msg.name || 'Teammate');
                    }
                    avatar.targetPos.set(THREE.MathUtils.clamp(state[0], -2500, 2500), THREE.MathUtils.clamp(state[1], 0, 4), THREE.MathUtils.clamp(state[2], -2500, 2500));
                    avatar.targetYaw = THREE.MathUtils.clamp(state[3], -Math.PI * 8, Math.PI * 8);
                    avatar.hp = THREE.MathUtils.clamp(state[4], 0, 100);
                    avatar.hiding = Boolean(msg.hiding);
                    avatar.crouching = Boolean(msg.crouching);
                    avatar.lightOn = Boolean(msg.lightOn);
                    avatar.roomNum = THREE.MathUtils.clamp(Math.trunc(state[5]), 0, 101);
                    avatar.lastSeen = performance.now();
                    this.updateCoopHUD();
                } else if (msg.type === 'doorOpened') {
                    if (msg.newRoomNum > this.game.currentRoomNum) {
                        this.game.syncDoorAdvance(msg.newRoomNum, msg.nextOriginZ);
                    }
                } else if (msg.type === 'spawnEntity') {
                    if (msg.entityType === 'rush') this.game.spawnRushOrAmbush(false, true);
                    if (msg.entityType === 'ambush') this.game.spawnRushOrAmbush(true, true);
                    if (msg.entityType === 'eyes' && this.game.currentRoomData) this.game.spawnEyes(this.game.currentRoomData, true);
                    if (msg.entityType === 'screech') this.game.spawnScreech(true);
                    if (msg.entityType === 'seek' && this.game.currentRoomData?.roomType === 'seek') this.game.spawnSeekChase(this.game.currentRoomData, true);
                } else if (msg.type === 'bookCollected') {
                    if (msg.booksFound > this.game.booksFound) {
                        this.game.booksFound = msg.booksFound;
                        this.game.updateLibraryHUD();
                        this.game.showBanner(`📚 Teammate collected Security Book #${msg.booksFound}/5!`);
                    }
                } else if (msg.type === 'chat') {
                    this.addChatMessage(msg.name || 'Teammate', msg.text, '#38bdf8');
                }
            }

            sendChat(text) {
                const clean = (text || '').trim().slice(0, 80);
                if (!clean) return;
                this.addChatMessage(this.myName, clean, '#fbbf24');
                this.broadcast({ type: 'chat', name: this.myName, text: clean });
            }

            addChatMessage(sender, text, color = '#fbbf24') {
                const feed = document.getElementById('chat-feed');
                if (!feed) return;
                const line = document.createElement('div');
                line.className = 'px-2.5 py-1 rounded-lg bg-black/75 border border-white/10 text-[11px] text-white shadow backdrop-blur-sm';
                line.innerHTML = `<strong style="color:${color}">${sender}:</strong> <span>${text.replace(/</g, '&lt;')}</span>`;
                feed.appendChild(line);
                while (feed.children.length > 4) feed.removeChild(feed.firstChild);
                setTimeout(() => { if (line.parentNode) line.remove(); }, 7500);
            }

            createRemoteAvatar(id, name) {
                const idx = this.remotePlayers.size % this.palette.length;
                const accentHex = this.palette[idx];
                const cssColor = '#' + accentHex.toString(16).padStart(6, '0');

                const group = new THREE.Group();
                const shirtMat = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.55 });
                const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75 });
                const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.55 });

                // Stylized Roblox-inspired explorer avatar
                const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.78, 0.36), shirtMat);
                torso.position.y = 1.15;
                torso.castShadow = true;

                const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
                head.position.y = 1.82;
                head.castShadow = true;

                const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0x111827 }));
                visor.position.set(0, 1.85, 0.21);

                const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), shirtMat);
                leftArm.position.set(-0.47, 1.14, 0);
                const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), shirtMat);
                rightArm.position.set(0.47, 1.14, 0);

                const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.76, 0.26), pantsMat);
                leftLeg.position.set(-0.18, 0.38, 0);
                const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.76, 0.26), pantsMat);
                rightLeg.position.set(0.18, 0.38, 0);

                // Teammate's held light glow
                const heldLight = new THREE.PointLight(0xffcb7d, 0.85, 8);
                heldLight.position.set(0.45, 1.35, 0.4);

                const nameplate = TextureFactory.createNameplateSprite(name, cssColor);
                nameplate.position.y = 2.38;

                group.add(torso, head, visor, leftArm, rightArm, leftLeg, rightLeg, heldLight, nameplate);
                this.game.scene.add(group);

                const avatar = {
                    id,
                    name,
                    cssColor,
                    group,
                    limbs: { leftArm, rightArm, leftLeg, rightLeg },
                    heldLight,
                    targetPos: this.game.playerPos.clone().add(new THREE.Vector3(1.2, 0, 0)),
                    targetYaw: Math.PI,
                    hp: 100,
                    hiding: false,
                    crouching: false,
                    lightOn: true,
                    roomNum: this.game.currentRoomNum,
                    lastSeen: performance.now()
                };
                group.position.copy(avatar.targetPos);
                this.remotePlayers.set(id, avatar);
                this.updateCoopHUD();
                return avatar;
            }

            removeRemoteAvatar(id) {
                const av = this.remotePlayers.get(id);
                if (av) {
                    this.game.scene.remove(av.group);
                    this.remotePlayers.delete(id);
                }
            }

            toggleAIBot() {
                this.botActive = !this.botActive;
                if (this.botActive) {
                    this.createRemoteAvatar(this.botId, 'Hotel Buddy (AI)');
                    this.addChatMessage('Hotel Buddy (AI)', 'Ready to explore The Hotel together!', '#34d399');
                    this.game.showBanner('🤖 AI Co-Op Teammate joined your elevator!');
                } else {
                    this.removeRemoteAvatar(this.botId);
                    this.game.showBanner('🤖 AI Co-Op Teammate left.');
                }
                this.updateCoopHUD();
            }

            disconnect(silent = false) {
                this.connections.forEach(c => { try { c.close(); } catch (e) {} });
                this.connections.clear();
                if (this.peer) {
                    try { this.peer.destroy(); } catch (e) {}
                    this.peer = null;
                }
                this.remotePlayers.forEach((av, id) => {
                    if (id !== this.botId) this.removeRemoteAvatar(id);
                });
                this.mode = 'solo';
                this.roomCode = '';
                document.getElementById('coop-room-badge').classList.add('hidden');
                document.getElementById('btn-disconnect-coop').classList.add('hidden');
                if (!silent) this.setStatus('Solo Mode (Disconnected)');
                this.updateCoopHUD();
            }

            updateCoopHUD() {
                const box = document.getElementById('coop-hud-list');
                if (!box) return;
                if (this.mode === 'solo' && this.remotePlayers.size === 0) {
                    box.classList.add('hidden');
                    return;
                }
                box.classList.remove('hidden');
                let html = '';
                if (this.roomCode) {
                    html += `<div class="flex items-center justify-between text-emerald-300 font-bold pb-1 border-b border-emerald-800/50">
                        <span>👥 ROOM ${this.roomCode}</span>
                        <span>${this.remotePlayers.size + 1} Players</span>
                    </div>`;
                }
                this.remotePlayers.forEach(av => {
                    const statusIcon = av.hp <= 0 ? '💀' : (av.hiding ? '🚪 Hiding' : `❤️ ${Math.ceil(av.hp)}`);
                    html += `<div class="flex items-center justify-between text-amber-100">
                        <span class="truncate max-w-[115px] font-semibold" style="color:${av.cssColor}">${av.name}</span>
                        <span class="font-mono-code text-[10px]">${statusIcon}</span>
                    </div>`;
                });
                box.innerHTML = html;
            }

            update(dt, elapsed) {
                // 1. Broadcast local player state at ~15Hz when connected
                if (this.connections.size > 0 && performance.now() - this.lastSyncTime > 65) {
                    this.lastSyncTime = performance.now();
                    this.broadcast({
                        type: 'state',
                        id: this.myId,
                        name: this.myName,
                        x: this.game.playerPos.x,
                        y: this.game.playerPos.y,
                        z: this.game.playerPos.z,
                        yaw: this.game.yaw,
                        crouching: this.game.isCrouching,
                        hiding: this.game.isHiding,
                        hp: this.game.hp,
                        lightOn: this.game.itemLightOn,
                        roomNum: this.game.currentRoomNum
                    });
                }

                // 2. Update AI Co-Op Bot if active (follows player, hides when Rush spawns!)
                if (this.botActive && this.remotePlayers.has(this.botId)) {
                    const bot = this.remotePlayers.get(this.botId);
                    const rushDanger = Boolean(this.game.rushEntity);
                    bot.hiding = rushDanger;
                    bot.crouching = this.game.isCrouching || (this.game.currentRoomData?.roomType === 'library');
                    const desired = this.game.playerPos.clone().add(new THREE.Vector3(1.5, 0, 1.4));
                    if (this.game.currentRoomData) {
                        const hw = this.game.currentRoomData.width / 2 - 1.1;
                        desired.x = Math.max(-hw, Math.min(hw, desired.x));
                    }
                    bot.targetPos.lerp(desired, Math.min(1, dt * 2.8));
                    const dx = this.game.playerPos.x - bot.group.position.x;
                    const dz = this.game.playerPos.z - bot.group.position.z;
                    bot.targetYaw = Math.atan2(dx, dz);
                }

                // 3. Smoothly interpolate & animate all 3D teammate avatars
                this.remotePlayers.forEach(av => {
                    const prev = av.group.position.clone();
                    av.group.position.lerp(new THREE.Vector3(av.targetPos.x, 0, av.targetPos.z), Math.min(1, dt * 10));
                    av.group.rotation.y = av.targetYaw;
                    av.group.scale.y = av.crouching ? 0.68 : 1.0;
                    av.group.visible = !av.hiding && av.hp > 0;
                    av.heldLight.intensity = av.lightOn && !av.hiding ? 0.85 : 0;

                    const moved = av.group.position.distanceTo(prev);
                    if (moved > 0.004) {
                        const swing = Math.sin(elapsed * 11) * 0.6;
                        av.limbs.leftArm.rotation.x = swing;
                        av.limbs.rightArm.rotation.x = -swing;
                        av.limbs.leftLeg.rotation.x = -swing;
                        av.limbs.rightLeg.rotation.x = swing;
                    } else {
                        av.limbs.leftArm.rotation.x *= 0.85;
                        av.limbs.rightArm.rotation.x *= 0.85;
                        av.limbs.leftLeg.rotation.x *= 0.85;
                        av.limbs.rightLeg.rotation.x *= 0.85;
                    }
                });
            }
        }

        /***********************************************************************
         * 5. MAIN HD 3D GAME ENGINE & STATE CONTROLLER
         ***********************************************************************/
        class DoorsHotelGame {
            constructor() {
                this.canvas = document.getElementById('game-canvas');
                this.sound = new SoundEngine();
                this.highQuality = true;
                this.isLegacyGame = true;
                this.noclip = false;
                this.godmode = false;
                this.timeScale = 1;
                this.sessionSeed = Math.floor(Math.random() * 999999) + 1;

                // Three.js Scene + ACES Filmic Tone Mapping + Shadows
                this.scene = new THREE.Scene();
                this.scene.background = new THREE.Color(0x040202);
                this.scene.fog = new THREE.FogExp2(0x070404, 0.042);

                this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 95);
                this.scene.add(this.camera);

                this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
                this.renderer.outputEncoding = THREE.sRGBEncoding;
                this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
                this.renderer.toneMappingExposure = 1.08;
                this.renderer.shadowMap.enabled = true;
                this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

                this.composer = null;
                this.bloomPass = null;
                try {
                    this.composer = new EffectComposer(this.renderer);
                    this.composer.addPass(new RenderPass(this.scene, this.camera));
                    this.bloomPass = new UnrealBloomPass(
                        new THREE.Vector2(window.innerWidth, window.innerHeight),
                        0.22,
                        0.62,
                        0.88,
                    );
                    this.composer.addPass(this.bloomPass);
                } catch (error) {
                    console.warn('Bloom post-processing is unavailable; using direct rendering.', error);
                    this.composer?.dispose();
                    this.composer = null;
                    this.bloomPass = null;
                }

                this.viewmodel = new ViewmodelController(this.camera);
                this.multiplayer = new MultiplayerManager(this);
                this.admin = new Admin({ game: this, scene: this.scene, player: this, entities: null });

                // PBR Textures & Materials
                this.wallMaps = TextureFactory.createWallpaperMaps(false);
                this.darkWallMaps = TextureFactory.createWallpaperMaps(true);
                this.carpetMaps = TextureFactory.createCarpetMaps();
                this.woodTex = TextureFactory.createWoodTexture('#3f2213', '#1f0e07');
                this.darkWoodTex = TextureFactory.createWoodTexture('#29150c', '#120804');
                this.ceilingTex = TextureFactory.createCeilingTexture();
                this.stoneTex = TextureFactory.createStoneTexture();
                this.seekEyeTex = window.EntityTextures.createSeekEyeTexture();
                this.paintingTexes = [0, 1, 2].map(v => TextureFactory.createPaintingTexture(v));

                this.rushTex = window.EntityTextures.createEntitySprite('rush');
                this.ambushTex = window.EntityTextures.createEntitySprite('ambush');
                this.eyesTex = window.EntityTextures.createEntitySprite('eyes');
                this.screechTex = window.EntityTextures.createEntitySprite('screech');

                this.brassMat = new THREE.MeshStandardMaterial({ color: 0xd9b24c, metalness: 0.82, roughness: 0.26 });
                this.woodMat = new THREE.MeshStandardMaterial({ map: this.woodTex, roughness: 0.62, metalness: 0.08 });
                this.darkWoodMat = new THREE.MeshStandardMaterial({ map: this.darkWoodTex, roughness: 0.68, metalness: 0.06 });

                // Core Player State
                this.hp = 100;
                this.gold = 0;
                this.currentRoomNum = 0;
                this.isAlive = false;
                this.isPaused = true;
                this.isCrouching = false;
                this.isSprinting = false;
                this.isHiding = false;
                this.hideTimer = 0;
                this.speedBoostTimer = 0;
                this.starterChoice = 'lighter';
                this.screenShake = 0;

                // Camera & Movement State
                this.playerPos = new THREE.Vector3(0, 1.7, -2.5);
                this.yaw = Math.PI;
                this.pitch = 0;
                this.moveState = { forward: false, backward: false, left: false, right: false };
                this.joystickVec = { x: 0, y: 0 };
                this.touchUIVisible = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth < 900);
                this.walkBobTimer = 0;
                this.lastStepSound = 0;

                // Inventory
                this.inventory = [];
                this.selectedSlot = 0;
                this.itemLightOn = false;

                // Dynamic Held Tool Lights
                this.playerPointLight = new THREE.PointLight(0xffa43d, 0, 15, 1.6);
                this.scene.add(this.playerPointLight);

                this.playerSpotLight = new THREE.SpotLight(0xfff7e2, 0, 32, Math.PI / 5.2, 0.45, 1.2);
                this.playerSpotLight.castShadow = true;
                this.playerSpotLight.shadow.mapSize.set(512, 512);
                this.playerSpotTarget = new THREE.Object3D();
                this.scene.add(this.playerSpotLight);
                this.scene.add(this.playerSpotTarget);
                this.playerSpotLight.target = this.playerSpotTarget;

                this.hemiLight = new THREE.HemisphereLight(0x3a261e, 0x0d0707, 0.48);
                this.scene.add(this.hemiLight);

                this.initAmbientParticles();

                this.activeRooms = [];
                this.interactables = [];
                this.currentRoomData = null;

                this.rushEntity = null;
                this.screechEntity = null;
                this.eyesEntity = null;
                this.figureEntity = null;
                this.seekEntity = null;
                this.lastEntityRoom = -10;
                this.nextLegacyEntityId = 1;

                this.libraryCode = [];
                this.booksFound = 0;

                this.clock = new THREE.Clock();
                this.statsElement = document.createElement('output');
                this.statsElement.className = 'legacy-stats';
                this.statsElement.hidden = true;
                document.body.append(this.statsElement);
                this.statsFrames = 0;
                this.statsElapsed = 0;
                this.setupEventListeners();
                this.updateInventoryUI();
                this.animate();
            }

            initAmbientParticles() {
                const count = 220;
                const positions = new Float32Array(count * 3);
                for (let i = 0; i < count; i++) {
                    positions[i * 3] = (Math.random() - 0.5) * 18;
                    positions[i * 3 + 1] = Math.random() * 4.5;
                    positions[i * 3 + 2] = (Math.random() - 0.5) * 26;
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                const mat = new THREE.PointsMaterial({ color: 0xffd89e, size: 0.055, transparent: true, opacity: 0.42, depthWrite: false });
                this.dustPoints = new THREE.Points(geo, mat);
                this.scene.add(this.dustPoints);
            }

            setupEventListeners() {
                window.addEventListener('resize', () => {
                    this.camera.aspect = window.innerWidth / window.innerHeight;
                    this.camera.updateProjectionMatrix();
                    this.renderer.setSize(window.innerWidth, window.innerHeight);
                    this.composer?.setSize(window.innerWidth, window.innerHeight);
                });

                document.getElementById('btn-gfx-toggle').addEventListener('click', () => {
                    this.setGraphicsQuality(!this.highQuality);
                    this.showBanner(this.highQuality ? '✨ HD lighting, bloom & particles enabled' : '⚡ Fast Performance Mode Enabled');
                });

                // Desktop Pointer Lock + Mouse Drag Look
                let isDraggingLook = false;
                let prevMouse = { x: 0, y: 0 };

                this.canvas.addEventListener('click', () => {
                    if (!this.isAlive || this.isPaused) return;
                    this.sound.init();
                    if (document.pointerLockElement !== this.canvas && this.canvas.requestPointerLock) {
                        try { this.canvas.requestPointerLock(); } catch (e) {}
                    }
                });

                this.canvas.addEventListener('mousedown', (e) => {
                    if (e.button === 0) {
                        isDraggingLook = true;
                        prevMouse.x = e.clientX;
                        prevMouse.y = e.clientY;
                    }
                });
                window.addEventListener('mouseup', () => { isDraggingLook = false; });

                window.addEventListener('mousemove', (e) => {
                    if (!this.isAlive || this.isPaused) return;
                    if (document.pointerLockElement === this.canvas) {
                        this.yaw -= e.movementX * 0.0023;
                        this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - e.movementY * 0.0023));
                    } else if (isDraggingLook) {
                        const dx = e.clientX - prevMouse.x;
                        const dy = e.clientY - prevMouse.y;
                        prevMouse.x = e.clientX;
                        prevMouse.y = e.clientY;
                        this.yaw -= dx * 0.004;
                        this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - dy * 0.004));
                    }
                });

                // Multi-Touch Right-Side Camera Look
                let touchLookId = null;
                let prevTouch = { x: 0, y: 0 };
                this.canvas.addEventListener('touchstart', (e) => {
                    if (!this.isAlive) return;
                    this.sound.init();
                    if (!this.touchUIVisible) this.setTouchUIVisible(true);
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        const t = e.changedTouches[i];
                        if (touchLookId === null) {
                            touchLookId = t.identifier;
                            prevTouch.x = t.clientX;
                            prevTouch.y = t.clientY;
                            break;
                        }
                    }
                }, { passive: false });

                this.canvas.addEventListener('touchmove', (e) => {
                    if (!this.isAlive) return;
                    e.preventDefault();
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        const t = e.changedTouches[i];
                        if (t.identifier === touchLookId) {
                            const dx = t.clientX - prevTouch.x;
                            const dy = t.clientY - prevTouch.y;
                            prevTouch.x = t.clientX;
                            prevTouch.y = t.clientY;
                            this.yaw -= dx * 0.0055;
                            this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - dy * 0.0055));
                        }
                    }
                }, { passive: false });

                const endTouchLook = (e) => {
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        if (e.changedTouches[i].identifier === touchLookId) touchLookId = null;
                    }
                };
                this.canvas.addEventListener('touchend', endTouchLook);
                this.canvas.addEventListener('touchcancel', endTouchLook);

                // Left-Thumb Virtual Joystick
                const joyZone = document.getElementById('joystick-zone');
                const joyKnob = document.getElementById('joystick-knob');
                let joyTouchId = null;
                let joyMouseDown = false;
                const maxRadius = 38;

                const updateJoystick = (clientX, clientY) => {
                    const rect = joyZone.getBoundingClientRect();
                    let dx = clientX - (rect.left + rect.width / 2);
                    let dy = clientY - (rect.top + rect.height / 2);
                    const dist = Math.hypot(dx, dy);
                    if (dist > maxRadius) {
                        dx = (dx / dist) * maxRadius;
                        dy = (dy / dist) * maxRadius;
                    }
                    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
                    this.joystickVec.x = dx / maxRadius;
                    this.joystickVec.y = -dy / maxRadius;
                };

                const resetJoystick = () => {
                    joyTouchId = null;
                    joyMouseDown = false;
                    joyKnob.style.transform = `translate(0px, 0px)`;
                    this.joystickVec.x = 0;
                    this.joystickVec.y = 0;
                };

                joyZone.addEventListener('touchstart', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    this.sound.init();
                    joyTouchId = e.changedTouches[0].identifier;
                    updateJoystick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
                }, { passive: false });

                joyZone.addEventListener('touchmove', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        if (e.changedTouches[i].identifier === joyTouchId) {
                            updateJoystick(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
                        }
                    }
                }, { passive: false });

                joyZone.addEventListener('touchend', (e) => {
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        if (e.changedTouches[i].identifier === joyTouchId) resetJoystick();
                    }
                });
                joyZone.addEventListener('touchcancel', resetJoystick);

                joyZone.addEventListener('mousedown', (e) => { e.stopPropagation(); joyMouseDown = true; updateJoystick(e.clientX, e.clientY); });
                window.addEventListener('mousemove', (e) => { if (joyMouseDown) updateJoystick(e.clientX, e.clientY); });
                window.addEventListener('mouseup', () => { if (joyMouseDown) resetJoystick(); });

                // Keyboard Controls (ignore while typing in chat/name inputs)
                window.addEventListener('keydown', (e) => {
                    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
                    if (!this.isAlive) return;
                    const code = e.code;
                    if (code === 'KeyW' || code === 'ArrowUp') this.moveState.forward = true;
                    if (code === 'KeyS' || code === 'ArrowDown') this.moveState.backward = true;
                    if (code === 'KeyA' || code === 'ArrowLeft') this.moveState.left = true;
                    if (code === 'KeyD' || code === 'ArrowRight') this.moveState.right = true;
                    if (code === 'ShiftLeft' || code === 'ShiftRight') this.isSprinting = true;
                    if (code === 'ControlLeft' || code === 'ControlRight') this.isCrouching = true;
                    if (code === 'KeyE') this.triggerInteraction();
                    if (code === 'KeyC' && !e.repeat) this.toggleCrouch();
                    if (code === 'KeyF') this.toggleEquippedLight();
                    if (code === 'KeyQ') this.useEquippedItem();
                    if (code.startsWith('Digit')) {
                        const num = parseInt(code.replace('Digit', ''), 10);
                        if (num >= 1 && num <= 6) this.selectSlot(num - 1);
                    }
                });

                window.addEventListener('keyup', (e) => {
                    const code = e.code;
                    if (code === 'KeyW' || code === 'ArrowUp') this.moveState.forward = false;
                    if (code === 'KeyS' || code === 'ArrowDown') this.moveState.backward = false;
                    if (code === 'KeyA' || code === 'ArrowLeft') this.moveState.left = false;
                    if (code === 'KeyD' || code === 'ArrowRight') this.moveState.right = false;
                    if (code === 'ShiftLeft' || code === 'ShiftRight') this.isSprinting = false;
                    if (code === 'ControlLeft' || code === 'ControlRight') this.isCrouching = false;
                });

                // Touch Buttons
                document.getElementById('touch-interact').addEventListener('click', (e) => { e.stopPropagation(); this.sound.init(); this.triggerInteraction(); });
                document.getElementById('touch-crouch').addEventListener('click', (e) => { e.stopPropagation(); this.sound.init(); this.toggleCrouch(); });
                document.getElementById('touch-use-item').addEventListener('click', (e) => { e.stopPropagation(); this.sound.init(); this.useEquippedItem(); });
                document.getElementById('interact-prompt').addEventListener('click', (e) => { e.stopPropagation(); this.sound.init(); this.triggerInteraction(); });

                this.setTouchUIVisible(this.touchUIVisible);
                document.getElementById('btn-touch-toggle').addEventListener('click', () => this.setTouchUIVisible(!this.touchUIVisible));
                document.getElementById('btn-fullscreen').addEventListener('click', () => {
                    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
                    else document.exitFullscreen?.().catch(() => {});
                });

                // Starter Loadout
                document.querySelectorAll('.starter-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        document.querySelectorAll('.starter-btn').forEach(b => {
                            b.className = 'starter-btn p-2.5 rounded-xl bg-black/50 border border-amber-800/50 text-left transition';
                        });
                        btn.className = 'starter-btn p-2.5 rounded-xl bg-amber-600/30 border-2 border-amber-400 text-left transition';
                        this.starterChoice = btn.getAttribute('data-item');
                    });
                });

                // Revive / Restart

                document.getElementById('btn-revive').addEventListener('click', () => {
                    document.getElementById('death-modal').classList.add('hidden');
                    this.revivePlayer();
                });
                document.getElementById('btn-restart').addEventListener('click', () => {
                    document.getElementById('death-modal').classList.add('hidden');
                    this.startNewRun();
                });

                // Multiplayer Co-Op Modal Listeners
                const coopModal = document.getElementById('coop-modal');
                const openCoop = () => {
                    this.sound.init();
                    if (document.pointerLockElement) document.exitPointerLock();
                    coopModal.classList.remove('hidden');
                };
                document.getElementById('btn-open-coop-start').addEventListener('click', openCoop);
                document.getElementById('btn-coop-toggle').addEventListener('click', openCoop);
                document.getElementById('close-coop-modal').addEventListener('click', () => coopModal.classList.add('hidden'));

                document.getElementById('btn-host-coop').addEventListener('click', () => {
                    const name = document.getElementById('coop-player-name').value;
                    this.multiplayer.hostSession(name);
                });
                document.getElementById('btn-join-coop').addEventListener('click', () => {
                    const code = document.getElementById('coop-join-code').value;
                    const name = document.getElementById('coop-player-name').value;
                    this.multiplayer.joinSession(code, name);
                });
                document.getElementById('btn-copy-room-code').addEventListener('click', () => {
                    if (this.multiplayer.roomCode) {
                        navigator.clipboard?.writeText(this.multiplayer.roomCode).catch(() => {});
                        this.multiplayer.setStatus(`📋 Copied Room Code: ${this.multiplayer.roomCode}`);
                    }
                });
                document.getElementById('btn-disconnect-coop').addEventListener('click', () => this.multiplayer.disconnect());
                document.getElementById('btn-spawn-bot').addEventListener('click', () => {
                    if (!this.isAlive) {
                        document.getElementById('title-modal').classList.add('hidden');
                        document.getElementById('hud-layer').classList.remove('hidden');
                        this.startNewRun();
                    }
                    this.multiplayer.toggleAIBot();
                });

                document.querySelectorAll('.quick-chat-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this.multiplayer.sendChat(btn.getAttribute('data-msg'));
                        coopModal.classList.add('hidden');
                    });
                });
                const sendCustomChat = () => {
                    const inp = document.getElementById('coop-chat-input');
                    if (inp.value.trim()) {
                        this.multiplayer.sendChat(inp.value);
                        inp.value = '';
                    }
                };
                document.getElementById('btn-send-chat').addEventListener('click', sendCustomChat);
                document.getElementById('coop-chat-input').addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') sendCustomChat();
                });

                // Owner Admin terminal
                document.getElementById('btn-admin-toggle').addEventListener('click', () => this.admin.toggle());

                // VS Code / Codespaces Modal
                const vsModal = document.getElementById('vscode-modal');
                document.getElementById('btn-vscode-guide').addEventListener('click', () => {
                    if (document.pointerLockElement) document.exitPointerLock();
                    vsModal.classList.remove('hidden');
                });
                document.getElementById('close-vscode-modal').addEventListener('click', () => vsModal.classList.add('hidden'));
                document.getElementById('btn-close-vscode-bottom').addEventListener('click', () => vsModal.classList.add('hidden'));

                // Export / Download Buttons
                document.getElementById('btn-download-start')?.addEventListener('click', () => this.downloadGameFile('export-status-start'));
                document.getElementById('btn-download-modal').addEventListener('click', () => this.downloadGameFile('export-status-modal'));
                document.getElementById('btn-download-hud')?.addEventListener('click', () => this.downloadGameFile(null));

                document.getElementById('btn-copy-start')?.addEventListener('click', () => this.copyGameSource('export-status-start'));
                document.getElementById('btn-copy-modal').addEventListener('click', () => this.copyGameSource('export-status-modal'));
            }

            /*******************************************************************
             * 6. RUN INITIALIZATION & INVENTORY
             *******************************************************************/
            startNewRun(overrideSeed = null, startRoom = 0, startOriginZ = 0) {
                this.sessionSeed = overrideSeed || (Math.floor(Math.random() * 999999) + 1);
                this.lastEntityRoom = -10;
                this.hp = 100;
                this.gold = 0;
                this.currentRoomNum = startRoom;
                this.isAlive = true;
                this.isPaused = false;
                this.isHiding = false;
                this.isCrouching = false;
                this.screenShake = 0;
                this.inventory = [];
                this.clearAllEntities();

                if (this.starterChoice === 'lighter') {
                    this.addItem({ id: 'lighter', name: 'Lighter', icon: '🔥', charges: 100, maxCharges: 100 });
                } else if (this.starterChoice === 'flashlight') {
                    this.addItem({ id: 'flashlight', name: 'Flashlight', icon: '🔦', charges: 100, maxCharges: 100 });
                } else if (this.starterChoice === 'vitamins') {
                    this.addItem({ id: 'vitamins', name: 'Vitamins', icon: '💊', charges: 2, maxCharges: 2 });
                } else if (this.starterChoice === 'lockpick') {
                    this.addItem({ id: 'lockpick', name: 'Lockpicks', icon: '🗝️', charges: 2, maxCharges: 2 });
                }

                this.selectedSlot = 0;
                this.itemLightOn = true;
                this.updateHUD();
                this.updateInventoryUI();

                this.activeRooms.forEach(r => this.scene.remove(r.group));
                this.activeRooms = [];
                this.buildRoom(startRoom, new THREE.Vector3(0, 0, startOriginZ));
                this.playerPos.set(0, 1.7, startOriginZ - 2.5);
                this.yaw = Math.PI;
                this.pitch = 0;

                if (startRoom === 0) {
                    this.showBanner('Welcome to The Hotel. Grab the Reception Key from the table to unlock Door 001.');
                }
            }

            revivePlayer() {
                this.hp = 100;
                this.isAlive = true;
                this.isPaused = false;
                this.isHiding = false;
                document.getElementById('closet-overlay').classList.add('hidden');
                this.clearAllEntities();
                this.addItem({ id: 'crucifix', name: 'Crucifix', icon: '✝️', charges: 1, maxCharges: 1 });
                this.updateHUD();
                this.showBanner('✨ Guiding Light revived you and blessed you with a Crucifix!');
            }

            addItem(newItem) {
                const existing = this.inventory.find(i => i.id === newItem.id);
                if (existing) {
                    existing.charges = Math.min(existing.maxCharges, existing.charges + newItem.charges);
                } else if (this.inventory.length < 6) {
                    this.inventory.push(newItem);
                }
                this.updateInventoryUI();
            }

            hasItem(id) {
                return this.inventory.some(i => i.id === id && i.charges > 0);
            }

            consumeItem(id, amount = 1) {
                const idx = this.inventory.findIndex(i => i.id === id);
                if (idx === -1) return false;
                this.inventory[idx].charges -= amount;
                if (this.inventory[idx].charges <= 0) {
                    this.inventory.splice(idx, 1);
                    if (this.selectedSlot >= this.inventory.length) {
                        this.selectedSlot = Math.max(0, this.inventory.length - 1);
                    }
                }
                this.updateInventoryUI();
                return true;
            }

            selectSlot(index) {
                this.selectedSlot = index;
                this.updateInventoryUI();
            }

            useEquippedItem() {
                const item = this.inventory[this.selectedSlot];
                if (!item) return;

                if (item.id === 'lighter' || item.id === 'flashlight') {
                    this.itemLightOn = !this.itemLightOn;
                    this.sound.playDrawerSlide();
                } else if (item.id === 'vitamins') {
                    this.consumeItem('vitamins', 1);
                    this.hp = Math.min(100, this.hp + 25);
                    this.speedBoostTimer = 10.0;
                    this.sound.playPickupChime();
                    this.showBanner('💊 Vitamins consumed! Sprint speed & Vitality boosted.');
                    this.updateHUD();
                }
                this.updateInventoryUI();
            }

            toggleEquippedLight() {
                const item = this.inventory[this.selectedSlot];
                if (!item || !['lighter', 'flashlight'].includes(item.id)) {
                    this.showBanner('Equip a lighter or flashlight to toggle its light.');
                    return;
                }
                this.itemLightOn = !this.itemLightOn;
                this.sound.playDrawerSlide();
                this.updateInventoryUI();
            }

            updateInventoryUI() {
                const bar = document.getElementById('inventory-bar');
                bar.innerHTML = '';
                for (let i = 0; i < 6; i++) {
                    const item = this.inventory[i];
                    const isSelected = i === this.selectedSlot;
                    const slotEl = document.createElement('button');
                    slotEl.className = `w-11 h-11 sm:w-14 sm:h-14 rounded-xl flex flex-col items-center justify-center relative transition border ${
                        isSelected
                            ? 'bg-amber-500/25 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.45)] scale-105'
                            : 'bg-neutral-900/80 border-amber-900/50 hover:border-amber-700'
                    }`;
                    slotEl.innerHTML = `
                        <span class="absolute top-0.5 left-1 font-mono-code text-[9px] text-amber-400/80">${i + 1}</span>
                        <span class="text-base sm:text-xl">${item ? item.icon : ''}</span>
                        <span class="text-[8px] sm:text-[9px] font-semibold text-amber-200 truncate max-w-[42px]">${item ? item.name : ''}</span>
                    `;
                    slotEl.addEventListener('click', () => {
                        this.selectSlot(i);
                        this.useEquippedItem();
                    });
                    bar.appendChild(slotEl);
                }
            }

            updateHUD() {
                document.getElementById('hp-text').textContent = `${Math.ceil(this.hp)} / 100`;
                document.getElementById('hp-bar').style.width = `${Math.max(0, this.hp)}%`;
                document.getElementById('gold-count').textContent = this.gold;
                document.getElementById('room-number-hud').textContent = String(this.currentRoomNum).padStart(3, '0');
                const adminRoom = document.getElementById('admin-room-value');
                const adminHp = document.getElementById('admin-hp-value');
                const adminEntity = document.getElementById('admin-entity-value');
                if (adminRoom) adminRoom.textContent = `${String(this.currentRoomNum).padStart(3, '0')} / 100`;
                if (adminHp) adminHp.textContent = `${Math.ceil(this.hp)} / 100`;
                if (adminEntity) {
                    const activeEntity = this.rushEntity ? (this.rushEntity.isAmbush ? 'AMBUSH' : 'RUSH')
                        : this.seekEntity ? 'SEEK' : this.figureEntity ? 'FIGURE'
                            : this.eyesEntity ? 'EYES' : this.screechEntity ? 'SCREECH' : 'CLEAR';
                    adminEntity.textContent = activeEntity;
                }
                document.getElementById('crouch-badge').classList.toggle('hidden', !this.isCrouching);
                document.getElementById('speed-badge').classList.toggle('hidden', this.speedBoostTimer <= 0);

                const touchCrouchBtn = document.getElementById('touch-crouch');
                if (touchCrouchBtn) {
                    touchCrouchBtn.className = this.isCrouching
                        ? 'w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-amber-600 border-2 border-amber-200 text-black flex flex-col items-center justify-center shadow-xl active:scale-95 transition'
                        : 'w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-neutral-900/85 border-2 border-amber-600/60 text-amber-200 flex flex-col items-center justify-center shadow-xl active:scale-95 transition';
                }
            }

            setGraphicsQuality(enabled) {
                this.highQuality = Boolean(enabled);
                this.renderer.shadowMap.enabled = this.highQuality;
                const pixelRatio = this.highQuality ? Math.min(window.devicePixelRatio || 1, 1.75) : 1;
                this.renderer.setPixelRatio(pixelRatio);
                this.composer?.setPixelRatio(pixelRatio);
                if (this.bloomPass) this.bloomPass.strength = this.highQuality ? 0.22 : 0;
                if (this.dustPoints) this.dustPoints.visible = this.highQuality;
                const hudToggle = document.getElementById('btn-gfx-toggle');
                const menuToggle = document.getElementById('options-gfx-toggle');
                if (hudToggle) hudToggle.textContent = this.highQuality ? '✨ HD' : '⚡ Fast';
                if (menuToggle) menuToggle.textContent = this.highQuality ? 'HD' : 'Fast';
            }

            setTouchUIVisible(visible) {
                this.touchUIVisible = visible;
                const wrapper = document.getElementById('mobile-controls-wrapper');
                const toggleBtn = document.getElementById('btn-touch-toggle');
                if (wrapper) wrapper.classList.toggle('hidden', !visible);
                if (toggleBtn) {
                    toggleBtn.className = visible
                        ? 'px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-sky-600 border border-sky-300 text-black text-[11px] sm:text-xs font-bold transition shadow-lg'
                        : 'px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-sky-950/85 hover:bg-sky-900 border border-sky-500/60 text-sky-200 text-[11px] sm:text-xs font-semibold transition shadow-lg';
                }
            }

            showBanner(text, duration = 3800) {
                const banner = document.getElementById('event-banner');
                if (!banner) return;
                banner.textContent = text;
                banner.style.opacity = '1';
                clearTimeout(this.bannerTimeout);
                this.bannerTimeout = setTimeout(() => {
                    banner.style.opacity = '0';
                }, duration);
            }

            /*******************************************************************
             * 7. DETERMINISTIC HD 3D HOTEL ROOM GENERATOR (CO-OP SYNCED)
             *******************************************************************/
            buildRoom(roomNum, originVec) {
                const { rng, roomType, subtitle, width, length, height } = window.LegacyRoomGeneration.createRoomPlan(roomNum, this.sessionSeed);
                const group = new THREE.Group();
                group.position.copy(originVec);
                this.scene.add(group);

                const interactables = [];
                const roomLights = [];

                document.getElementById('room-subtitle').textContent = subtitle;
                document.getElementById('library-hud').classList.toggle('hidden', roomType !== 'library');

                const isDark = roomType === 'dark';

                if (roomType === 'courtyard') {
                    this.scene.fog.color.setHex(0x09131f); this.scene.fog.density = 0.032;
                    this.dustPoints.material.color.setHex(0x93c5fd); this.dustPoints.material.size = 0.07;
                } else if (roomType === 'seek') {
                    this.scene.fog.color.setHex(0x1f0507); this.scene.fog.density = 0.044;
                    this.dustPoints.material.color.setHex(0xff5252); this.dustPoints.material.size = 0.06;
                } else if (isDark) {
                    this.scene.fog.color.setHex(0x020203); this.scene.fog.density = 0.075;
                    this.dustPoints.material.color.setHex(0x94a3b8); this.dustPoints.material.size = 0.045;
                } else {
                    this.scene.fog.color.setHex(0x090504); this.scene.fog.density = 0.036;
                    this.dustPoints.material.color.setHex(0xffd89e); this.dustPoints.material.size = 0.055;
                }

                // Floor
                const floorMat = roomType === 'courtyard'
                    ? new THREE.MeshStandardMaterial({ map: this.stoneTex, roughness: 0.42, metalness: 0.12 })
                    : new THREE.MeshStandardMaterial({ map: this.carpetMaps.map, bumpMap: this.carpetMaps.bumpMap, bumpScale: 0.04, roughness: 0.88, metalness: 0.04 });
                const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, length), floorMat);
                floor.rotation.x = -Math.PI / 2;
                floor.position.set(0, 0, -length / 2);
                floor.receiveShadow = true;
                group.add(floor);

                if (roomType !== 'courtyard') {
                    [-width / 2 + 0.55, width / 2 - 0.55].forEach(bx => {
                        const trimFloor = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, length), this.darkWoodMat);
                        trimFloor.position.set(bx, 0.01, -length / 2);
                        trimFloor.receiveShadow = true;
                        group.add(trimFloor);
                    });
                }

                // Ceiling
                const ceilMat = roomType === 'courtyard'
                    ? new THREE.MeshBasicMaterial({ color: 0x050914 })
                    : new THREE.MeshStandardMaterial({ map: this.ceilingTex, roughness: 0.72, metalness: 0.05 });
                const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, length), ceilMat);
                ceiling.rotation.x = Math.PI / 2;
                ceiling.position.set(0, height, -length / 2);
                group.add(ceiling);

                // Walls
                const wMaps = isDark ? this.darkWallMaps : this.wallMaps;
                const wallMat = roomType === 'courtyard'
                    ? new THREE.MeshStandardMaterial({ color: 0x172b1b, roughness: 0.92 })
                    : new THREE.MeshStandardMaterial({ map: wMaps.map, bumpMap: wMaps.bumpMap, bumpScale: 0.05, roughness: 0.76, metalness: 0.05 });

                const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(length, height), wallMat);
                leftWall.rotation.y = Math.PI / 2; leftWall.position.set(-width / 2, height / 2, -length / 2); leftWall.receiveShadow = true;
                const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(length, height), wallMat);
                rightWall.rotation.y = -Math.PI / 2; rightWall.position.set(width / 2, height / 2, -length / 2); rightWall.receiveShadow = true;
                const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMat);
                frontWall.position.set(0, height / 2, -length); frontWall.receiveShadow = true;
                group.add(leftWall, rightWall, frontWall);

                if (roomNum === 0) {
                    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMat);
                    backWall.rotation.y = Math.PI; backWall.position.set(0, height / 2, 0);
                    group.add(backWall);

                    const elevFrame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.4, 0.25), this.darkWoodMat);
                    elevFrame.position.set(0, 1.7, -0.12);
                    const elevDoors = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.0, 0.28), new THREE.MeshStandardMaterial({ color: 0x997329, metalness: 0.85, roughness: 0.3 }));
                    elevDoors.position.set(0, 1.5, -0.12);
                    group.add(elevFrame, elevDoors);
                }

                // Architectural Trim, Columns, Paintings & Sconces
                if (roomType !== 'courtyard') {
                    [-width / 2 + 0.14, width / 2 - 0.14].forEach(mx => {
                        const crown = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, length), this.darkWoodMat);
                        crown.position.set(mx, height - 0.14, -length / 2);
                        const base = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, length), this.darkWoodMat);
                        base.position.set(mx, 0.12, -length / 2);
                        group.add(crown, base);
                    });

                    for (let pz = -4; pz > -length + 2; pz -= 6.5) {
                        [-1, 1].forEach(side => {
                            const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.36, height, 0.42), this.darkWoodMat);
                            pillar.position.set(side * (width / 2 - 0.16), height / 2, pz);
                            group.add(pillar);

                            if (!isDark && Math.abs(pz) % 13 < 7) {
                                const sconce = this.createWallSconceMesh();
                                sconce.position.set(side * (width / 2 - 0.38), 2.75, pz);
                                sconce.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
                                group.add(sconce);
                            }
                        });

                        const beam = new THREE.Mesh(new THREE.BoxGeometry(width, 0.32, 0.44), this.darkWoodMat);
                        beam.position.set(0, height - 0.16, pz);
                        group.add(beam);

                        if (pz - 3.2 > -length + 2 && roomType !== 'seek') {
                            const side = ((Math.abs(Math.floor(pz)) + roomNum) % 2 === 0) ? -1 : 1;
                            const painting = this.createFramedPaintingMesh((roomNum + Math.abs(Math.floor(pz))) % 3);
                            painting.position.set(side * (width / 2 - 0.07), 2.55, pz - 3.2);
                            painting.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
                            group.add(painting);
                        }
                    }
                } else {
                    const moonLight = new THREE.DirectionalLight(0x8bb8ff, 0.85);
                    moonLight.position.set(6, 12, -length / 2);
                    group.add(moonLight);
                    for (let z = -4; z > -length + 2; z -= 6) {
                        [-width / 2 + 1.1, width / 2 - 1.1].forEach(hx => {
                            const stonePost = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.4, 0.7), new THREE.MeshStandardMaterial({ map: this.stoneTex, roughness: 0.85 }));
                            stonePost.position.set(hx, 1.2, z);
                            const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.32), new THREE.MeshBasicMaterial({ color: 0xffd27d }));
                            lantern.position.set(hx, 2.65, z);
                            group.add(stonePost, lantern);
                        });
                    }
                }

                // Chandeliers & Lights
                if (!isDark && roomType !== 'courtyard') {
                    const numLights = (roomType === 'library' || roomType === 'seek') ? 3 : 2;
                    for (let i = 0; i < numLights; i++) {
                        const lz = -length * ((i + 1) / (numLights + 1));
                        const chandGroup = this.createChandelierMesh(roomType === 'seek');
                        chandGroup.position.set(0, height - 0.1, lz);
                        group.add(chandGroup);

                        const pLight = new THREE.PointLight(roomType === 'seek' ? 0xff2e3b : 0xffb35c, roomType === 'seek' ? 1.5 : 1.25, 23, 1.5);
                        pLight.position.set(0, height - 1.0, lz);
                        if (i === 0 && this.highQuality) {
                            pLight.castShadow = true;
                            pLight.shadow.mapSize.set(512, 512);
                        }
                        group.add(pLight);
                        roomLights.push({ light: pLight, group: chandGroup });
                    }
                }

                // Reception Desk
                if (roomType === 'reception') {
                    const desk = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.15, 1.3), this.woodMat);
                    desk.position.set(-3.2, 0.575, -8.5); desk.castShadow = true;
                    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 1.48), new THREE.MeshStandardMaterial({ color: 0x1c1512, roughness: 0.2, metalness: 0.15 }));
                    counterTop.position.set(-3.2, 1.18, -8.5);
                    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.brassMat);
                    bell.position.set(-2.3, 1.24, -8.3);
                    group.add(desk, counterTop, bell);
                }

                // Wardrobes
                [
                    { x: -width / 2 + 0.8, z: -length * 0.36, rotY: Math.PI / 2 },
                    { x: width / 2 - 0.8, z: -length * 0.68, rotY: -Math.PI / 2 }
                ].forEach(cp => {
                    const closetMesh = this.createClosetMesh();
                    closetMesh.position.set(cp.x, 0, cp.z);
                    closetMesh.rotation.y = cp.rotY;
                    group.add(closetMesh);

                    interactables.push({
                        type: 'closet',
                        worldPos: new THREE.Vector3(cp.x, 1.5, cp.z).add(originVec),
                        title: 'Hotel Wardrobe',
                        desc: 'Hide inside from Rush, Ambush, or Figure',
                        onInteract: () => this.toggleClosetHide()
                    });
                });

                // Dressers & Keys
                const keyNeeded = (roomType === 'reception' || roomType === 'locked');
                let keySpawned = false;

                [
                    { x: width / 2 - 0.75, z: -length * 0.28, rotY: -Math.PI / 2 },
                    { x: -width / 2 + 0.75, z: -length * 0.72, rotY: Math.PI / 2 }
                ].forEach((spot, idx) => {
                    const dresserObj = this.createDresserMesh();
                    dresserObj.group.position.set(spot.x, 0, spot.z);
                    dresserObj.group.rotation.y = spot.rotY;
                    group.add(dresserObj.group);

                    const hasKeyHere = keyNeeded && (!keySpawned && idx === 0);
                    if (hasKeyHere) keySpawned = true;

                    let keyVisualGroup = null;
                    if (hasKeyHere) {
                        keyVisualGroup = this.createGlowingKeyPickup();
                        keyVisualGroup.position.set(spot.x, 1.32, spot.z);
                        group.add(keyVisualGroup);
                    }

                    let looted = false;
                    interactables.push({
                        type: 'drawer',
                        worldPos: new THREE.Vector3(spot.x, 1.0, spot.z).add(originVec),
                        title: hasKeyHere ? 'Key Table' : 'Hotel Dresser',
                        desc: hasKeyHere ? 'Grab the Room Key for the locked door' : 'Search for Gold, Batteries, Bandages & Items',
                        onInteract: (interObj) => {
                            if (looted) {
                                this.showBanner('This drawer is already empty.');
                                return;
                            }
                            looted = true;
                            interObj.title = 'Opened Dresser';
                            interObj.desc = 'Empty';
                            dresserObj.topDrawer.position.z = 0.42;
                            if (keyVisualGroup) keyVisualGroup.visible = false;
                            this.sound.playDrawerSlide();
                            this.lootDrawer(hasKeyHere, roomNum + 1);
                        }
                    });
                });

                // Seek Wall Eyes
                if (roomType === 'seek' || roomNum === 34) {
                    const eyeMat = new THREE.MeshBasicMaterial({ map: this.seekEyeTex, transparent: true });
                    for (let z = -3.5; z > -length + 3; z -= 4.2) {
                        [-1, 1].forEach(side => {
                            const eyePlane = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.9), eyeMat);
                            eyePlane.position.set(side * (width / 2 - 0.08), 2.1 + Math.sin(z) * 0.55, z);
                            eyePlane.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
                            group.add(eyePlane);
                        });
                    }
                }

                // Library Room
                if (roomType === 'library') {
                    this.setupLibraryRoom(group, originVec, width, length, interactables, rng);
                }

                // Exit Doors
                const nextNumStr = String(roomNum + 1).padStart(3, '0');
                let mainDoorPivot = null;

                if (roomType === 'dupe') {
                    const realOnLeft = rng() < 0.5;
                    const fakeNumStr = String(roomNum + (rng() < 0.5 ? 2 : 0)).padStart(3, '0');

                    [-2.4, 2.4].forEach((dx, idx) => {
                        const isReal = (idx === 0 && realOnLeft) || (idx === 1 && !realOnLeft);
                        const label = isReal ? nextNumStr : fakeNumStr;
                        const doorAssembly = this.createDoorAssembly(label, false);
                        doorAssembly.frame.position.set(dx, 0, -length + 0.14);
                        group.add(doorAssembly.frame);
                        if (isReal) mainDoorPivot = doorAssembly.pivot;

                        interactables.push({
                            type: 'door',
                            worldPos: new THREE.Vector3(dx, 1.5, -length + 0.6).add(originVec),
                            title: `Door ${label}`,
                            desc: 'Double-check your current door number!',
                            onInteract: () => {
                                if (isReal) this.openNextDoor(doorAssembly.pivot, originVec, length);
                                else this.triggerDupeAttack();
                            }
                        });
                    });
                } else {
                    const isLocked = keyNeeded || roomType === 'library';
                    const doorAssembly = this.createDoorAssembly(nextNumStr, roomType === 'library' || roomType === 'finale');
                    doorAssembly.frame.position.set(0, 0, -length + 0.14);
                    group.add(doorAssembly.frame);
                    mainDoorPivot = doorAssembly.pivot;

                    if (isDark || roomType === 'seek') {
                        const guideLight = new THREE.PointLight(0x4fd1ff, 1.45, 11);
                        guideLight.position.set(0, 2.5, -length + 1.1);
                        group.add(guideLight);
                    }

                    interactables.push({
                        type: 'door',
                        locked: isLocked,
                        worldPos: new THREE.Vector3(0, 1.5, -length + 0.6).add(originVec),
                        title: isLocked ? `Locked Door ${nextNumStr} 🔒` : `Door ${nextNumStr}`,
                        desc: roomType === 'library'
                            ? 'Collect all 5 Security Books to unlock!'
                            : (isLocked ? 'Requires Room Key or Lockpick' : 'Open to enter the next room'),
                        onInteract: (interObj) => {
                            if (roomType === 'library' && this.booksFound < 5) {
                                this.showBanner(`🔒 You need ${5 - this.booksFound} more Security Code Books!`);
                                return;
                            }
                            if (interObj.locked && roomType !== 'library') {
                                if (this.hasItem('key')) {
                                    this.consumeItem('key', 1);
                                    interObj.locked = false;
                                    this.sound.playPickupChime();
                                    this.showBanner(`🔓 Unlocked Door ${nextNumStr} with the Key!`);
                                } else if (this.hasItem('lockpick')) {
                                    this.consumeItem('lockpick', 1);
                                    interObj.locked = false;
                                    this.sound.playPickupChime();
                                    this.showBanner(`🗝️ Picked the lock on Door ${nextNumStr}!`);
                                } else {
                                    this.showBanner('🔒 Locked! Find the gleaming Key on the room dresser.');
                                    return;
                                }
                            }
                            this.openNextDoor(doorAssembly.pivot, originVec, length);
                        }
                    });
                }

                const roomObj = {
                    roomNum, roomType, group, origin: originVec.clone(), width, length, interactables, roomLights, mainDoorPivot
                };

                this.activeRooms.push(roomObj);
                if (this.activeRooms.length > 2) {
                    const old = this.activeRooms.shift();
                    this.scene.remove(old.group);
                }

                this.currentRoomData = roomObj;
                this.interactables = interactables;
                this.sound.setRoomMood(roomType);

                // Only Solo or Host triggers random entity spawns (and syncs to clients)
                if (roomNum > 0 && this.multiplayer.mode !== 'client') {
                    this.evaluateRoomEntitySpawns(roomObj);
                }
            }

            /*******************************************************************
             * 7B. 3D PROP BUILDERS
             *******************************************************************/
            createChandelierMesh(crimsonMode = false) {
                const g = new THREE.Group();
                const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 8), this.brassMat);
                chain.position.y = -0.42;
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.055, 8, 20), this.brassMat);
                ring.rotation.x = Math.PI / 2; ring.position.y = -0.85;
                g.add(chain, ring);
                const bulbMat = new THREE.MeshBasicMaterial({ color: crimsonMode ? 0xff4d5a : 0xffe29a });
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2;
                    const cx = Math.cos(a) * 0.65, cz = Math.sin(a) * 0.65;
                    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0xf5ebd6 }));
                    candle.position.set(cx, -0.74, cz);
                    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), bulbMat);
                    bulb.position.set(cx, -0.62, cz);
                    g.add(candle, bulb);
                }
                return g;
            }

            createWallSconceMesh() {
                const g = new THREE.Group();
                g.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 0.06), this.brassMat));
                const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.22, 10), new THREE.MeshBasicMaterial({ color: 0xffd98a }));
                shade.position.set(0, 0.08, 0.22);
                g.add(shade);
                return g;
            }

            createFramedPaintingMesh(variant) {
                const g = new THREE.Group();
                g.add(new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.35, 0.09), this.brassMat));
                const canvas = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 1.12), new THREE.MeshStandardMaterial({ map: this.paintingTexes[variant], roughness: 0.55 }));
                canvas.position.z = 0.05;
                g.add(canvas);
                return g;
            }

            createDoorAssembly(numStr, isBoss = false) {
                const frame = new THREE.Group();
                const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.55, 0.34), this.darkWoodMat); leftPost.position.set(-1.18, 1.775, 0);
                const rightPost = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.55, 0.34), this.darkWoodMat); rightPost.position.set(1.18, 1.775, 0);
                const topHeader = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.28, 0.38), this.darkWoodMat); topHeader.position.set(0, 3.58, 0);
                frame.add(leftPost, rightPost, topHeader);

                const pivot = new THREE.Group();
                pivot.position.set(-1.05, 0, 0);
                frame.add(pivot);

                const tex = TextureFactory.createDoorTexture(numStr, isBoss);
                const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(2.1, 3.4, 0.16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.48, metalness: 0.12 }));
                doorMesh.position.set(1.05, 1.7, 0);
                doorMesh.castShadow = true;
                const knob = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), this.brassMat);
                knob.position.set(1.88, 1.62, 0.14);
                pivot.add(doorMesh, knob);

                return { frame, pivot };
            }

            createClosetMesh() {
                const g = new THREE.Group();
                const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 3.25, 1.25), this.darkWoodMat);
                body.position.y = 1.68; body.castShadow = true;
                const cornice = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.22, 1.4), this.woodMat);
                cornice.position.y = 3.35;
                g.add(body, cornice);
                [-0.44, 0.44].forEach(dx => {
                    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.85, 0.08), this.woodMat);
                    panel.position.set(dx, 1.68, 0.63);
                    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), this.brassMat);
                    handle.position.set(dx < 0 ? -0.1 : 0.1, 1.65, 0.71);
                    g.add(panel, handle);
                });
                return g;
            }

            createDresserMesh() {
                const group = new THREE.Group();
                const cabinet = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.12, 1.02), this.woodMat);
                cabinet.position.y = 0.56; cabinet.castShadow = true;
                const topSlab = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.09, 1.12), this.darkWoodMat);
                topSlab.position.y = 1.15;
                const botDrawer = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.36, 0.08), this.darkWoodMat);
                botDrawer.position.set(0, 0.32, 0.52);
                const topDrawer = new THREE.Group();
                const tdFace = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.36, 0.5), this.darkWoodMat);
                tdFace.position.set(0, 0.82, 0.32);
                const tdKnob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), this.brassMat);
                tdKnob.position.set(0, 0.82, 0.6);
                topDrawer.add(tdFace, tdKnob);
                group.add(cabinet, topSlab, botDrawer, topDrawer);
                return { group, topDrawer };
            }

            createGlowingKeyPickup() {
                const g = new THREE.Group();
                const bow = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 16), this.brassMat);
                const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 8), this.brassMat);
                shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.22;
                const glow = new THREE.PointLight(0x4fd1ff, 1.1, 6); glow.position.y = 0.15;
                g.add(bow, shaft, glow);
                return g;
            }

            setupLibraryRoom(group, originVec, width, length, interactables, rng) {
                this.booksFound = 0;
                this.libraryCode = Array.from({ length: 5 }, () => Math.floor(rng() * 9) + 1);
                this.updateLibraryHUD();

                const bookColors = [0x7c2d12, 0x1e3a8a, 0x14532d, 0x581c87, 0x78350f];
                [
                    { x: -4.8, z: -7 }, { x: 4.8, z: -7 },
                    { x: -4.8, z: -14 }, { x: 4.8, z: -14 },
                    { x: -4.8, z: -20.5 }
                ].forEach((sc, idx) => {
                    const shelfGroup = new THREE.Group();
                    shelfGroup.position.set(sc.x, 0, sc.z);
                    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 3.8, 4.4), this.darkWoodMat);
                    frame.position.y = 1.9;
                    shelfGroup.add(frame);

                    for (let row = 0; row < 4; row++) {
                        for (let b = -1.6; b <= 1.6; b += 0.42) {
                            const bMat = new THREE.MeshStandardMaterial({ color: bookColors[(idx + row + Math.abs(Math.floor(b * 3))) % bookColors.length], roughness: 0.75 });
                            const decBook = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.14), bMat);
                            decBook.position.set(sc.x < 0 ? 1.05 : -1.05, 0.65 + row * 0.8, b);
                            shelfGroup.add(decBook);
                        }
                    }
                    group.add(shelfGroup);

                    const bookMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.2), new THREE.MeshBasicMaterial({ color: 0x4fd1ff }));
                    const bx = sc.x + (sc.x < 0 ? 1.25 : -1.25);
                    bookMesh.position.set(bx, 1.45, sc.z);
                    const bookGlow = new THREE.PointLight(0x4fd1ff, 0.9, 5);
                    bookGlow.position.set(bx, 1.5, sc.z);
                    group.add(bookMesh, bookGlow);

                    let collected = false;
                    interactables.push({
                        type: 'book',
                        worldPos: new THREE.Vector3(bx, 1.45, sc.z).add(originVec),
                        title: `Security Code Book #${idx + 1}`,
                        desc: 'Reveals 1 digit of the Library padlock',
                        onInteract: (interObj) => {
                            if (collected) return;
                            collected = true;
                            bookMesh.visible = false;
                            bookGlow.intensity = 0;
                            interObj.title = 'Book Collected';
                            interObj.desc = 'Code digit recorded';
                            this.booksFound++;
                            this.sound.playPickupChime();
                            this.updateLibraryHUD();
                            this.multiplayer.broadcast({ type: 'bookCollected', booksFound: this.booksFound });
                            if (this.booksFound >= 5) this.showBanner('🔓 All 5 Security Books found! Sneak to Door 051!');
                        }
                    });
                });

                this.spawnFigure(originVec, length);
            }

            updateLibraryHUD() {
                const digits = this.libraryCode.map((d, i) => (i < this.booksFound ? d : '_')).join(' ');
                document.getElementById('library-code-display').textContent = digits;
                document.getElementById('library-books-found').textContent = `Books Collected: ${this.booksFound} / 5 (Stay Crouched!)`;
            }

            lootDrawer(hasKey, nextRoomNum) {
                if (hasKey) {
                    this.addItem({ id: 'key', name: `Key ${String(nextRoomNum).padStart(3, '0')}`, icon: '🔑', charges: 1, maxCharges: 1 });
                    this.sound.playPickupChime();
                    this.showBanner(`🔑 Found the Room Key for Door ${String(nextRoomNum).padStart(3, '0')}!`);
                    return;
                }
                const roll = Math.random();
                if (roll < 0.08) {
                    this.damagePlayer(5, 'Timothy', 'Timothy is a small spider hiding inside hotel drawers.');
                    this.showBanner('🕷️ Ah! Timothy the spider jumped out! (-5 Vitality)');
                } else if (roll < 0.22) {
                    this.addItem({ id: 'crucifix', name: 'Crucifix', icon: '✝️', charges: 1, maxCharges: 1 });
                    this.sound.playPickupChime();
                    this.showBanner('✝️ Jackpot! You found a glowing Crucifix!');
                } else if (roll < 0.42) {
                    this.hp = Math.min(100, this.hp + 20);
                    this.sound.playPickupChime();
                    this.showBanner('🩹 Found a Bandage! (+20 Vitality)');
                } else if (roll < 0.62) {
                    this.addItem({ id: 'vitamins', name: 'Vitamins', icon: '💊', charges: 1, maxCharges: 3 });
                    this.sound.playPickupChime();
                    this.showBanner('💊 Found Vitamins inside the drawer!');
                } else if (roll < 0.78) {
                    this.addItem({ id: 'lockpick', name: 'Lockpick', icon: '🗝️', charges: 1, maxCharges: 3 });
                    this.sound.playPickupChime();
                    this.showBanner('🗝️ Found a Lockpick!');
                } else {
                    const coins = Math.floor(Math.random() * 25) + 10;
                    this.gold += coins;
                    this.inventory.forEach(item => {
                        if (item.id === 'flashlight' || item.id === 'lighter') item.charges = Math.min(item.maxCharges, item.charges + 30);
                    });
                    this.sound.playPickupChime();
                    this.showBanner(`🪙 Found +${coins} Gold & fresh Batteries!`);
                }
                this.updateHUD();
            }

            openNextDoor(doorPivot, currentOrigin, currentLength, fromNetwork = false) {
                if (doorPivot && doorPivot.userData.opened) return;
                if (doorPivot) {
                    doorPivot.userData.opened = true;
                    let openProgress = 0;
                    const swingIv = setInterval(() => {
                        openProgress += 0.14;
                        doorPivot.rotation.y = Math.min(Math.PI * 0.56, openProgress * Math.PI * 0.56);
                        if (openProgress >= 1) clearInterval(swingIv);
                    }, 16);
                }

                this.sound.playDoorOpen();
                this.currentRoomNum++;
                this.updateHUD();

                const nextOrigin = currentOrigin.clone().add(new THREE.Vector3(0, 0, -currentLength));
                if (!fromNetwork) {
                    this.multiplayer.broadcast({
                        type: 'doorOpened',
                        newRoomNum: this.currentRoomNum,
                        nextOriginZ: nextOrigin.z
                    });
                }

                if (this.currentRoomNum > 100) {
                    this.triggerVictory();
                    return;
                }
                this.buildRoom(this.currentRoomNum, nextOrigin);
            }

            syncDoorAdvance(newRoomNum, nextOriginZ) {
                if (this.currentRoomData && this.currentRoomData.mainDoorPivot) {
                    this.currentRoomData.mainDoorPivot.rotation.y = Math.PI * 0.56;
                }
                this.sound.playDoorOpen();
                this.currentRoomNum = newRoomNum;
                this.updateHUD();
                if (this.currentRoomNum > 100) {
                    this.triggerVictory();
                    return;
                }
                this.buildRoom(this.currentRoomNum, new THREE.Vector3(0, 0, nextOriginZ));
                this.showBanner(`👥 Teammate opened Door ${String(newRoomNum).padStart(3, '0')}!`);
            }

            /*******************************************************************
             * 8. SCULPTED 3D ENTITIES & CO-OP SYNCED AI
             *******************************************************************/






















            /*******************************************************************
             * 9. PLAYER ACTIONS, ADMIN & CLEAN FILE DOWNLOADER
             *******************************************************************/
            toggleCrouch() {
                if (this.isHiding) return;
                this.isCrouching = !this.isCrouching;
                this.updateHUD();
            }

            toggleClosetHide() {
                if (this.isHiding) {
                    this.isHiding = false; this.hideTimer = 0;
                    document.getElementById('closet-overlay').classList.add('hidden');
                    document.getElementById('vignette-layer').classList.remove('hide-warning');
                    this.sound.playDoorOpen();
                } else {
                    this.isHiding = true; this.hideTimer = 0;
                    document.getElementById('closet-overlay').classList.remove('hidden');
                    this.sound.playDoorOpen();
                    this.showBanner('Hiding inside Wardrobe. Press [E] to exit once the danger passes.');
                }
            }

            triggerInteraction() {
                if (this.isHiding) { this.toggleClosetHide(); return; }
                if (this.activeInteractable) this.activeInteractable.onInteract(this.activeInteractable);
            }

            damagePlayer(amount, entityName, guidingTip) {
                if (!this.isAlive || this.godmode) return;
                this.hp = Math.max(0, this.hp - amount);
                this.updateHUD();

                const vig = document.getElementById('vignette-layer');
                vig.classList.add('damage-pulse');
                setTimeout(() => vig.classList.remove('damage-pulse'), 350);

                if (this.hp <= 0) {
                    this.isAlive = false;
                    if (document.pointerLockElement) document.exitPointerLock();
                    document.getElementById('death-header').textContent = 'YOU DIED';
                    document.getElementById('death-cause').textContent = `Eliminated by ${entityName} at Door ${String(this.currentRoomNum).padStart(3, '0')}`;
                    document.getElementById('guiding-light-tip').textContent = `"${guidingTip}"`;
                    document.getElementById('death-modal').classList.remove('hidden');
                }
            }

            triggerVictory() {
                this.isAlive = false;
                if (document.pointerLockElement) document.exitPointerLock();
                document.getElementById('death-header').textContent = 'YOU ESCAPED THE HOTEL!';
                document.getElementById('death-cause').textContent = `Reached Door 100 with ${this.gold} Gold!`;
                document.getElementById('guiding-light-tip').textContent = `"Congratulations! You survived all 100 doors of The Hotel and reached the escape elevator."`;
                document.getElementById('death-modal').classList.remove('hidden');
            }



            legacyRoomPlan(roomNum) {
                return window.LegacyRoomGeneration.createRoomPlan(roomNum, this.sessionSeed);
            }

            nextEntityId(type) {
                return `entity-${type}-${this.nextLegacyEntityId++}`;
            }

            warpToRoom(roomNum, fromNetwork = false) {
                const target = Math.trunc(Number(roomNum));
                if (!Number.isInteger(target) || target < 0 || target > 100) return false;
                this.clearAllEntities();
                this.entityHazard = null;
                for (const room of this.activeRooms) this.scene.remove(room.group);
                this.activeRooms = [];
                this.currentRoomNum = target;
                this.updateHUD();
                this.buildRoom(target, new THREE.Vector3(0, 0, 0));
                this.playerPos.set(0, 1.7, -2.2);
                if (!fromNetwork) this.multiplayer.broadcast({ type: 'doorOpened', newRoomNum: target, nextOriginZ: 0 });
                return true;
            }

            removeLegacyEntity(query) {
                const type = String(query ?? '').trim().toLowerCase();
                if (type === 'all') {
                    this.clearAllEntities();
                    this.entityHazard = null;
                    return 'All active encounters cleared.';
                }
                const entities = [
                    ['rush', this.rushEntity], ['ambush', this.rushEntity?.isAmbush ? this.rushEntity : null],
                    ['screech', this.screechEntity], ['eyes', this.eyesEntity],
                    ['figure', this.figureEntity], ['seek', this.seekEntity], ['chaser', this.seekEntity],
                ];
                const match = entities.find(([name, entity]) => entity && (name === type || entity.id?.toLowerCase() === type));
                if (!match) return `No active entity matched ${type}.`;
                this.disposeEntityMesh(match[1].mesh);
                if (match[0] === 'rush' || match[0] === 'ambush') this.rushEntity = null;
                else if (match[0] === 'chaser' || match[0] === 'seek') this.seekEntity = null;
                else this[`${match[0]}Entity`] = null;
                this.entityHazard = null;
                if (match[0] === 'screech') document.getElementById('screech-indicator').classList.add('hidden');
                if (match[0] === 'eyes') document.getElementById('vignette-layer').classList.remove('eyes-aura');
                this.updateHUD();
                return `Removed ${match[0]}.`;
            }

            updateStats(frameDelta) {
                if (this.statsElement.hidden) return;
                this.statsFrames++;
                this.statsElapsed += frameDelta;
                if (this.statsElapsed < 0.5) return;
                const fps = Math.round(this.statsFrames / Math.max(this.statsElapsed, 0.001));
                const { calls, triangles } = this.renderer.info.render;
                this.statsElement.textContent = `FPS ${fps}  /  CALLS ${calls}  /  TRIANGLES ${triangles.toLocaleString()}  /  ROOM ${String(this.currentRoomNum).padStart(3, '0')}`;
                this.statsFrames = 0;
                this.statsElapsed = 0;
            }


            getCleanSourceHTML() {
                const clone = document.documentElement.cloneNode(true);
                clone.querySelectorAll('head style').forEach(styleEl => {
                    if (styleEl.id !== 'doors-custom-styles') styleEl.remove();
                });
                const showIds = ['title-modal'];
                const hideIds = [
                    'hud-layer', 'death-modal', 'vscode-modal', 'admin-panel', 'coop-modal',
                    'closet-overlay', 'jumpscare-canvas', 'interact-prompt', 'screech-indicator',
                    'library-hud', 'crouch-badge', 'speed-badge', 'coop-hud-list', 'coop-room-badge', 'btn-disconnect-coop'
                ];
                showIds.forEach(id => clone.querySelector('#' + id)?.classList.remove('hidden'));
                hideIds.forEach(id => clone.querySelector('#' + id)?.classList.add('hidden'));

                ['inventory-bar', 'chat-feed', 'coop-hud-list'].forEach(id => {
                    const el = clone.querySelector('#' + id);
                    if (el) el.innerHTML = '';
                });
                ['export-status-start', 'export-status-modal'].forEach(id => {
                    const el = clone.querySelector('#' + id);
                    if (el) el.textContent = '';
                });
                const gameCanvas = clone.querySelector('#game-canvas');
                if (gameCanvas) { gameCanvas.removeAttribute('width'); gameCanvas.removeAttribute('height'); gameCanvas.removeAttribute('style'); }
                const scareCanvas = clone.querySelector('#jumpscare-canvas');
                if (scareCanvas) { scareCanvas.removeAttribute('width'); scareCanvas.removeAttribute('height'); }
                const vignette = clone.querySelector('#vignette-layer');
                if (vignette) vignette.className = '';
                const banner = clone.querySelector('#event-banner');
                if (banner) banner.style.opacity = '0';

                return '<!DOCTYPE html>\n' + clone.outerHTML;
            }

            downloadGameFile(statusElementId) {
                try {
                    const fullHtml = this.getCleanSourceHTML();
                    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'index.html';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 1500);

                    const msg = '✅ Saved index.html! Ready to upload to GitHub or open in Codespaces.';
                    if (statusElementId) document.getElementById(statusElementId).textContent = msg;
                    if (this.isAlive) this.showBanner(msg);
                } catch (err) {
                    const errMsg = '⚠️ Direct download blocked—use "Copy Full Code" instead!';
                    if (statusElementId) document.getElementById(statusElementId).textContent = errMsg;
                    if (this.isAlive) this.showBanner(errMsg);
                }
            }

            copyGameSource(statusElementId) {
                try {
                    const fullHtml = this.getCleanSourceHTML();
                    const ta = document.createElement('textarea');
                    ta.value = fullHtml;
                    ta.style.position = 'fixed'; ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.focus(); ta.select();
                    const ok = document.execCommand('copy');
                    document.body.removeChild(ta);
                    const msg = ok ? '📋 Copied! Paste into index.html in GitHub Codespaces or VS Code.' : '⚠️ Copy blocked—select from code editor.';
                    if (statusElementId) document.getElementById(statusElementId).textContent = msg;
                    if (this.isAlive) this.showBanner(msg);
                } catch (err) {
                    if (statusElementId) document.getElementById(statusElementId).textContent = '⚠️ Copy failed—please copy from code editor.';
                }
            }

            /*******************************************************************
             * 10. MAIN RENDER & GAMEPLAY LOOP
             *******************************************************************/
            animate() {
                requestAnimationFrame(() => this.animate());
                const frameDelta = this.clock.getDelta();
                const dt = Math.min(frameDelta, 0.1) * this.timeScale;
                const elapsed = this.clock.elapsedTime;
                this.updateStats(frameDelta);

                if (!this.isAlive || !this.currentRoomData) {
                    this.renderFrame();
                    return;
                }

                if (this.speedBoostTimer > 0) {
                    this.speedBoostTimer -= dt;
                    if (this.speedBoostTimer <= 0) this.updateHUD();
                }

                // Ambient particles
                if (this.highQuality && this.dustPoints) {
                    const posAttr = this.dustPoints.geometry.attributes.position;
                    const isRain = this.currentRoomData.roomType === 'courtyard';
                    for (let i = 0; i < posAttr.count; i++) {
                        let y = posAttr.getY(i) - (isRain ? 7.5 * dt : 0.14 * dt);
                        if (y < 0.05) y = 4.6;
                        posAttr.setY(i, y);
                    }
                    posAttr.needsUpdate = true;
                    this.dustPoints.position.set(this.playerPos.x, 0, this.playerPos.z);
                }

                // Movement & Hide
                if (this.isHiding) {
                    this.hideTimer += dt;
                    if (this.hideTimer > 6.5) {
                        document.getElementById('vignette-layer').classList.add('hide-warning');
                        this.screenShake = Math.max(this.screenShake, 0.04);
                        if (Math.random() < 0.08) this.sound.playHeartbeat();
                    }
                    if (this.hideTimer > 10.0) {
                        this.toggleClosetHide();
                        this.damagePlayer(35, 'Hide', 'Do not stay inside a wardrobe too long! Exit immediately after the entity passes.');
                        this.showBanner('👁️ HIDE pushed you out! (-35 Vitality)');
                    }
                } else {
                    let baseSpeed = this.isCrouching ? 3.25 : (this.isSprinting ? 8.8 : 6.25);
                    if (this.speedBoostTimer > 0) baseSpeed *= 1.45;

                    let strafe = (this.moveState.right ? 1 : 0) - (this.moveState.left ? 1 : 0) + this.joystickVec.x;
                    let forward = (this.moveState.forward ? 1 : 0) - (this.moveState.backward ? 1 : 0) + this.joystickVec.y;

                    if (strafe !== 0 || forward !== 0) {
                        const length = Math.hypot(strafe, forward);
                        const mag = Math.min(1.0, length);
                        strafe /= length;
                        forward /= length;
                        const sin = Math.sin(this.yaw);
                        const cos = Math.cos(this.yaw);
                        const dx = (sin * forward + cos * strafe) * baseSpeed * mag * dt;
                        const dz = (cos * forward - sin * strafe) * baseSpeed * mag * dt;
                        this.playerPos.x += dx;
                        this.playerPos.z += dz;
                        this.walkBobTimer += dt * (this.isCrouching ? 6.5 : 11.2) * mag;
                        if (elapsed - this.lastStepSound > (this.isCrouching ? 0.55 : 0.36)) {
                            this.sound.playFootstep(this.isCrouching);
                            this.lastStepSound = elapsed;
                        }
                    }

                    if (!this.noclip) {
                        const rm = this.currentRoomData;
                        const halfW = rm.width / 2 - 0.9;
                        this.playerPos.x = Math.max(-halfW, Math.min(halfW, this.playerPos.x));
                        this.playerPos.z = Math.max(rm.origin.z - rm.length + 0.9, Math.min(rm.origin.z - 0.55, this.playerPos.z));
                    }
                }

                // Camera + Shake
                this.screenShake = Math.max(0, this.screenShake - dt * 0.9);
                const shakeX = (Math.random() - 0.5) * this.screenShake;
                const shakeY = (Math.random() - 0.5) * this.screenShake;
                const targetHeight = this.isCrouching ? 1.05 : 1.72;
                const bobOffset = this.isHiding ? 0 : Math.sin(this.walkBobTimer) * 0.055;
                this.camera.position.set(this.playerPos.x + shakeX, targetHeight + bobOffset + shakeY, this.playerPos.z);

                const lookDir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
                this.camera.lookAt(this.camera.position.clone().add(lookDir));

                // 3D Viewmodel & Lights
                const equipped = this.inventory[this.selectedSlot];
                this.viewmodel.update(equipped, this.itemLightOn, this.isHiding, elapsed, this.walkBobTimer);

                this.playerPointLight.intensity = 0;
                this.playerSpotLight.intensity = 0;
                if (equipped && this.itemLightOn && equipped.charges > 0 && !this.isHiding) {
                    if (equipped.id === 'lighter') {
                        this.playerPointLight.intensity = 1.65 + Math.sin(elapsed * 22) * 0.16;
                        this.playerPointLight.position.copy(this.camera.position).add(lookDir.clone().multiplyScalar(0.45));
                        equipped.charges = Math.max(0, equipped.charges - dt * 0.75);
                    } else if (equipped.id === 'flashlight') {
                        this.playerSpotLight.intensity = 3.1;
                        this.playerSpotLight.position.copy(this.camera.position);
                        this.playerSpotTarget.position.copy(this.camera.position).add(lookDir.clone().multiplyScalar(12));
                        equipped.charges = Math.max(0, equipped.charges - dt * 1.05);
                    }
                }

                // Proximity Interactables
                let closest = null;
                let minDist = 3.25;
                for (const inter of this.interactables) {
                    const d = this.playerPos.distanceTo(inter.worldPos);
                    if (d < minDist) { minDist = d; closest = inter; }
                }
                this.activeInteractable = closest;
                const promptEl = document.getElementById('interact-prompt');
                const touchInteractLabel = document.getElementById('touch-interact-label');
                if (this.isHiding) {
                    promptEl.classList.add('hidden');
                    if (touchInteractLabel) touchInteractLabel.textContent = 'EXIT';
                } else if (closest) {
                    promptEl.classList.remove('hidden');
                    document.getElementById('interact-title').textContent = closest.title;
                    document.getElementById('interact-desc').textContent = closest.desc;
                    if (touchInteractLabel) touchInteractLabel.textContent = closest.title.split(' ')[0].toUpperCase();
                } else {
                    promptEl.classList.add('hidden');
                    if (touchInteractLabel) touchInteractLabel.textContent = 'USE [E]';
                }

                // Update Co-Op Multiplayer Avatars & Entities
                this.multiplayer.update(dt, elapsed);
                this.updateEntities(dt, elapsed, lookDir);
                this.renderFrame();
            }

            renderFrame() {
                if (this.highQuality && this.composer) {
                    try {
                        this.composer.render();
                        return;
                    } catch (error) {
                        console.warn('Bloom rendering failed; switching to direct rendering.', error);
                        this.composer.dispose();
                        this.composer = null;
                        this.bloomPass = null;
                    }
                }
                this.renderer.render(this.scene, this.camera);
            }


        }

        window.DoorsHotelGame = DoorsHotelGame;

        window.onload = function () {
            const openModal = (id) => document.getElementById(id)?.classList.remove('hidden');
            const closeModal = (id) => document.getElementById(id)?.classList.add('hidden');

            document.getElementById('btn-start-game')?.addEventListener('click', (event) => {
                const button = event.currentTarget;
                const status = document.getElementById('game-start-status');
                if (!window.doorsGame) {
                    console.error('The 3D game engine is still unavailable.');
                    status.hidden = false;
                    status.textContent = 'The 3D engine did not finish loading. Check the browser console and refresh.';
                    return;
                }
                button.disabled = true;
                button.setAttribute('aria-busy', 'true');
                button.querySelector('span').textContent = 'Preparing the hotel…';
                status.hidden = true;
                try {
                    window.doorsGame.sound.init();
                    window.doorsGame.startNewRun();
                    if (!window.doorsGame.currentRoomData || !window.doorsGame.isAlive) {
                        throw new Error('The first room did not finish generating.');
                    }
                    document.getElementById('title-modal').classList.add('hidden');
                    document.getElementById('title-modal').setAttribute('aria-hidden', 'true');
                    document.getElementById('hud-layer').classList.remove('hidden');
                    const lockRequest = window.doorsGame.canvas.requestPointerLock?.();
                    lockRequest?.catch?.(() => {});
                } catch (error) {
                    console.error('Could not start the hotel:', error);
                    window.doorsGame.isAlive = false;
                    document.getElementById('title-modal').classList.remove('hidden');
                    document.getElementById('title-modal').removeAttribute('aria-hidden');
                    document.getElementById('hud-layer').classList.add('hidden');
                    status.hidden = false;
                    status.textContent = `Could not start the hotel: ${error instanceof Error ? error.message : 'unknown startup error'}`;
                } finally {
                    button.disabled = false;
                    button.removeAttribute('aria-busy');
                    button.querySelector('span').textContent = 'Enter the hotel';
                }
            });
            document.getElementById('btn-open-coop-start')?.addEventListener('click', () => {
                window.doorsGame?.sound?.init();
                openModal('coop-modal');
            });
            document.getElementById('old-menu-options')?.addEventListener('click', () => openModal('options-modal'));
            document.getElementById('close-options-modal')?.addEventListener('click', () => closeModal('options-modal'));
            document.getElementById('options-gfx-toggle')?.addEventListener('click', (event) => {
                if (window.doorsGame) window.doorsGame.setGraphicsQuality(!window.doorsGame.highQuality);
                event.currentTarget.textContent = window.doorsGame?.highQuality === false ? 'Fast' : 'HD';
            });
            document.getElementById('options-fullscreen')?.addEventListener('click', () => {
                if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
                else document.exitFullscreen?.();
            });
            document.getElementById('old-menu-account')?.addEventListener('click', () => openModal('account-modal'));
            document.getElementById('close-account-modal')?.addEventListener('click', () => closeModal('account-modal'));
            document.getElementById('account-form')?.addEventListener('submit', (event) => {
                event.preventDefault();
                const name = document.getElementById('account-name').value.trim().slice(0, 14) || 'Explorer';
                document.getElementById('coop-player-name').value = name;
                document.getElementById('account-status').textContent = 'Profile saved for this session.';
            });

            try {
                if (typeof THREE === 'undefined') throw new Error('Three.js did not load');
                window.doorsGame = new DoorsHotelGame();
            } catch (error) {
                console.error('Unknown Hotel startup failed:', error);
                document.getElementById('title-modal')?.classList.remove('hidden');
                const status = document.getElementById('game-start-status');
                if (status) {
                    status.hidden = false;
                    status.textContent = `The 3D engine could not start: ${error instanceof Error ? error.message : 'WebGL initialization failed'}. Check WebGL support and the browser console.`;
                }
            }
        };
